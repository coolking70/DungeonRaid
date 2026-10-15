"""Independent A02 coverage, geometry, provenance and image-similarity checks.

Default validates UI assets without opening reverse images.
--copyright is the explicit task-authorized read-only pixel comparison exception.
No reverse crop is saved or displayed. No original pixels feed the builder.
"""
from __future__ import annotations
import argparse
import hashlib
import itertools
import json
import re
from pathlib import Path
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[2]
ART=ROOT/'art/ui'
MIN_MAE=10.0
MIN_CENTER_MAE=12.0
MAX_SIMILARITY=.90
MAX_SSIM=.80


def require(condition,message):
    if not condition:raise AssertionError(message)


def read(path):return json.loads(path.read_text())


def flat(image,bg=0,size=32):
    out=Image.new('RGBA',image.size,(bg,bg,bg,255));out.alpha_composite(image.convert('RGBA'))
    return np.asarray(out.convert('RGB').resize((size,size),Image.Resampling.NEAREST)).astype(float)


def ssim(a,b):
    a,b=a@np.array([.299,.587,.114]),b@np.array([.299,.587,.114])
    def mean(x):return np.lib.stride_tricks.sliding_window_view(x,(7,7)).mean(axis=(-1,-2))
    ma,mb=mean(a),mean(b);va,vb,cov=mean(a*a)-ma*ma,mean(b*b)-mb*mb,mean(a*b)-ma*mb
    c1,c2=(255*.01)**2,(255*.03)**2
    return float(np.mean((2*ma*mb+c1)*(2*cov+c2)/((ma*ma+mb*mb+c1)*(va+vb+c2))))


def check(copyright=False):
    manifest=read(ART/'manifest.json');atlas=Image.open(ART/'ui.png')
    require(atlas.mode=='RGBA','Atlas must be RGBA')
    require(max(atlas.size)<=2048 and list(atlas.size)==manifest['atlasSize'],'Wrong atlas size')
    require(manifest['scale']==2,'Wrong pixel scale')
    assets={a['id']:a for a in manifest['assets']};bindings={e['id']:e for e in manifest['elements']}
    require(len(assets)==len(manifest['assets']) and len(bindings)==len(manifest['elements']),'Duplicate IDs')
    spec=(ROOT/'docs/spec/13-art-requests.md').read_text()
    semantic=set(re.findall(r'`((?:ClassType|RaceType|PerkType|FlawType|SkillType|StatIcon)\.\d+)`',spec))
    require(len(semantic)==90 and semantic<=assets.keys(),'Missing one of 90 semantic icons')
    layout=read(ROOT/'data/ui-layout.json')
    needed={e['id'] for e in layout['elements']}|semantic
    require(needed==bindings.keys(),'Bindings must cover all native elements and semantic slots')
    table_ids=set(re.findall(r'^\| `([^`]+)` \|',spec.split('## 装备400槽')[0],re.M))
    require(table_ids<=bindings.keys(),'Missing spec13 interface ID')
    extras={'ui.panel','ui.button','ui.button.pressed','ui.button.disabled','ui.tab','ui.scroll.track','ui.scroll.thumb',
        'ui.lock','ui.check','ui.arrow.back','ui.arrow.next','ui.selection','ui.death-cross','ui.menu','ui.stats',
        'ui.sound.on','ui.sound.off','hud.status.poison','hud.status.burning','hud.status.frozen','ui.flare','ui.particle',
        'ui.shield.left','ui.shield.right','tooltip.pointer','hud.resource.slot','hud.gold.fill','hud.gold.column',
        'hud.health','hud.health.frame','hud.armour.icon','ui.slot.charging','ui.slot.ready','ui.slot.disabled',
        'foldout.option.base','foldout.option.base.pressed','foldout.option.base.disabled'}
    require(extras<=assets.keys(),'Missing A02 supplemental component')
    occupied=np.zeros((atlas.height,atlas.width),dtype=bool);crops={};coverage=[];slice_count=0
    for id,a in assets.items():
        x,y,w,h=a['rect'];lw,lh=a['logicalSize']
        require(all(isinstance(v,int) for v in [x,y,w,h]),'Noninteger atlas rect '+id)
        require(x>=0 and y>=0 and w>0 and h>0 and x+w<=atlas.width and y+h<=atlas.height,'Out of bounds '+id)
        require(w==lw*2 and h==lh*2,'Not 2x logical size '+id)
        require(not occupied[y:y+h,x:x+w].any(),'Overlapping physical assets '+id)
        occupied[y:y+h,x:x+w]=True
        crop=atlas.crop((x,y,x+w,y+h));crops[id]=crop
        pix=np.asarray(crop);coverage.append(float((pix[:,:,3]>0).mean()))
        require(coverage[-1]>.005,'Empty asset '+id)
        require(a['source']=='openai-built-in-imagegen' and a['prompt'].strip(),'Missing provenance '+id)
        p=ROOT/a['file'];require(hashlib.sha256(p.read_bytes()).hexdigest()==a['sha256'],'Wrong output hash '+id)
        require(np.array_equal(np.asarray(Image.open(p)),pix),'Source/atlas mismatch '+id)
        source=ROOT/a['sourceFile']
        require('reverse' not in source.parts,'Original artwork in generation path')
        require(hashlib.sha256(source.read_bytes()).hexdigest()==a['sourceSha256'],'Intermediate hash mismatch '+id)
        # Every 2x2 block must exactly represent one logical pixel.
        require(np.array_equal(pix,np.repeat(np.repeat(pix[::2,::2],2,0),2,1)),'Not nearest-neighbor 2x '+id)
        margins=a['sliceMargins'];l,t,r,b=margins
        require(a['sliceMarginsAtlas']==[v*2 for v in margins],'Wrong slice pixel units '+id)
        require(all(isinstance(v,int) and v>=0 for v in margins) and l+r<lw and t+b<lh,'Illegal nine-slice '+id)
        if a['nineSlice']:slice_count+=1;require(min(margins)>0,'Missing nine-slice margins '+id)
        else:require(margins==[0,0,0,0],'Non-slice has margins '+id)
        for state in a['states'].values():
            for key in ('asset','overlay'):
                if key in state:require(state[key] in assets,'Invalid state reference '+id)
    require(not np.asarray(atlas)[:,:,3][~occupied].any(),'Nontransparent unused atlas region')
    for s in layout['artSlots']:
        require(assets[s['id']]['logicalSize']==s['logicalSize'],'Wrong native icon dimensions '+s['id'])
        require(not assets[s['id']]['nineSlice'],'Icons must not stretch')
        require({'normal','selected','disabled','locked'}<=assets[s['id']]['states'].keys(),'Missing semantic states')
        require(float((np.asarray(crops[s['id']])[:,:,3]==0).mean())>.03,'Missing transparent icon margin')
    for e in layout['elements']:
        b=bindings[e['id']];rect=e['rect']
        if rect and rect.get('w') is not None and rect.get('h') is not None:
            require(np.allclose(b['logicalSize'],[rect['w'],rect['h']],atol=.00001),'Wrong known geometry '+e['id'])
        else:require(b['logicalSize'] is None,'Invented unresolved geometry '+e['id'])
        if b['asset']:
            require(b['rect']==assets[b['asset']]['rect'],'Binding UV mismatch '+e['id'])
        else:require(b['rect'] is None and b['render'] in ('font','external-atlas','solid-color','dynamic-icon'),'Unaccounted blank '+e['id'])
    require(crops['main.background'].size==(640,960),'Background must be 640x960')
    # Compare all semantic pairs, not just members of one category.
    arrays={id:flat(crops[id]) for id in semantic};pairs=[]
    for a,b in itertools.combinations(sorted(semantic),2):
        diff=np.abs(arrays[a]-arrays[b]);whole=float(diff.mean());center=float(diff[5:27,5:27].mean())
        pairs.append(dict(pair=[a,b],mae32=whole,centerMae32=center))
    flagged=[p for p in pairs if p['mae32']<=MIN_MAE or p['centerMae32']<=MIN_CENTER_MAE]
    result=dict(status='PASS' if not flagged else 'FAIL',assets=len(assets),bindings=len(bindings),semanticIcons=len(semantic),
        semanticPairs=len(pairs),thresholds=dict(mae32=MIN_MAE,centerMae32=MIN_CENTER_MAE),
        closestPairs=sorted(pairs,key=lambda p:p['mae32'])[:12],flaggedPairs=flagged,
        minimumAlphaCoverage=min(coverage),nineSliceAssets=slice_count,unusedNontransparentPixels=0,
        provenanceCount=len(assets),atlasSha256=hashlib.sha256((ART/'ui.png').read_bytes()).hexdigest(),
        logicalPreviewSize=list(Image.open(ART/'preview.png').size),
        limitation='MAE screens duplicate-like images; perceptual distinction and text-free artwork also require contact-sheet review.')
    if copyright:
        originals={};measurements=[];not_applicable=[]
        # Authoritative UVs come independently from the specification, not the generated manifest.
        for e in layout['artSlots']+layout['elements']:
            b=bindings[e['id']];uv=e.get('uv');name=e.get('atlas')
            if not b.get('asset') or not uv or name not in ('tiles','menus'):
                not_applicable.append({'id':e['id'],'reason':'No fixed original graphic UV or font/code/external/dynamic binding'})
                continue
            if not all(isinstance(uv.get(k),(int,float)) for k in ['x','y','w','h']):
                not_applicable.append({'id':e['id'],'reason':'Unresolved original UV'});continue
            if name not in originals:
                p=ROOT/'reverse/apktool/res/drawable-nodpi-v4'/(name+'.png')
                originals[name]=Image.open(p).convert('RGBA')
                require(originals[name].size==((512,512) if name=='menus' else (1024,1024)),'Unexpected original atlas dimensions')
            scale=.5 if name=='menus' else 1
            box=tuple(round(v*scale) for v in [uv['x'],uv['y'],uv['x']+uv['w'],uv['y']+uv['h']])
            require(box[2]>box[0] and box[3]>box[1],'Empty original UV')
            old=originals[name].crop(box)
            new=crops[b['asset']]
            if b['nineSlice'] and b.get('logicalSize'):
                # Compare the rendered known-size binding, not its reusable seed shape.
                dw,dh=[round(v*2) for v in b['logicalSize']]
                l,t,r,bt=b['sliceMarginsAtlas'];sw,sh=new.size
                expanded=Image.new('RGBA',(dw,dh))
                sx,sy=[0,l,sw-r,sw],[0,t,sh-bt,sh]
                dx,dy=[0,l,dw-r,dw],[0,t,dh-bt,dh]
                for iy in range(3):
                    for ix in range(3):
                        piece=new.crop((sx[ix],sy[iy],sx[ix+1],sy[iy+1]))
                        piece=piece.resize((dx[ix+1]-dx[ix],dy[iy+1]-dy[iy]),Image.Resampling.NEAREST)
                        expanded.paste(piece,(dx[ix],dy[iy]))
                new=expanded
            if e['id']=='main.sound':old=old.transpose(Image.Transpose.ROTATE_90)
            # Same A01 nearest sampling and black/white background comparison.
            scores=[];structures=[]
            for bg in [0,255]:
                aa,bb=flat(new,bg,64),flat(old,bg,64)
                scores.append(float(1-np.abs(aa-bb).mean()/255));structures.append(ssim(aa,bb))
            measurements.append(dict(id=e['id'],asset=b['asset'],similarity=max(scores),ssim=max(structures)))
        high=max(measurements,key=lambda m:m['similarity']);high_ssim=max(measurements,key=lambda m:m['ssim'])
        failures=[m for m in measurements if m['similarity']>=MAX_SIMILARITY or m['ssim']>=MAX_SSIM]
        result['copyrightComparison']=dict(method='A01: corresponding source UV -> nearest64; max black/white RGB 1-MAE/255 and 7x7 luminance SSIM; menus UV /2; main.sound rotated90',
            count=len(measurements),maximumSimilarity=high,maximumSSIM=high_ssim,threshold=MAX_SIMILARITY,ssimThreshold=MAX_SSIM,
            failures=failures,measurements=measurements,notApplicable=not_applicable,
            limitation='Numerical screen only. Unknown native UVs are explicitly not screened, not guessed.')
        if failures:result['status']='FAIL'
    return result


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--copyright',action='store_true');args=parser.parse_args()
    result=check(args.copyright)
    (ART/('check_copyright.json' if args.copyright else 'check_result.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    compact=result.copy()
    if args.copyright:compact['copyrightComparison']={k:v for k,v in result['copyrightComparison'].items() if k not in ('measurements','notApplicable')}
    print(json.dumps(compact,ensure_ascii=False,indent=2))
    raise SystemExit(0 if result['status']=='PASS' else 1)
