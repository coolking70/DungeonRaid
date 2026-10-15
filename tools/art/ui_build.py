"""A02 offline UI atlas builder. Only reads original imagegen intermediates.

python3 tools/art/ui_build.py --prepare  # import generated_images cache once
python3 tools/art/ui_build.py            # portable deterministic offline rebuild
Pillow + numpy required. Never reads reverse images or writes outside A02 scope.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageEnhance

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'art/ui'
NEAREST = Image.Resampling.NEAREST


def read(path):
    return json.loads(Path(path).read_text())


def write(path, data):
    Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def requests():
    return read(ART / 'generations.json')['generations'] + read(ART / 'component_requests.json')['generations']


def prepare():
    prepared = []
    for request in requests():
        record_path = ART / 'src/records' / (request['id'] + '.json')
        r = read(record_path) if record_path.exists() else request.copy()
        if not r.get('raw_path'):
            print('PENDING', r['id'])
            continue
        raw_path = Path(r['raw_path']).resolve()
        if 'generated_images' not in raw_path.parts or 'reverse' in raw_path.parts:
            raise ValueError('Only built-in generated_images sources allowed')
        raw = Image.open(raw_path).convert('RGBA')
        if r.get('cropBox'):
            raw = raw.crop(tuple(r['cropBox']))
        if r.get('alphaCutoff'):
            raw.putalpha(raw.getchannel('A').point(lambda v: 255 if v >= r['alphaCutoff'] else 0))
        size = tuple(r['logicalSize'])
        if r['kind'] == 'background':
            small = ImageOps.fit(raw, size, method=Image.Resampling.BOX)
        else:
            # Ignore barely visible alpha fringe when finding bounds, preserve alpha inside.
            mask = raw.getchannel('A').point(lambda v: 255 if v >= 32 else 0)
            bounds = mask.getbbox()
            if not bounds:
                raise ValueError('Empty generation: ' + r['id'])
            raw = raw.crop(bounds)
            small = Image.new('RGBA', size)
            if r['kind'] in ('panel', 'button', 'frame', 'tab', 'fill', 'gold'):
                fitted = raw.resize(size, Image.Resampling.BOX)
                small = fitted
            else:
                pad = r.get('padding', 2 if min(size) >= 24 else 1)
                fitted = ImageOps.contain(raw, (size[0]-2*pad, size[1]-2*pad), Image.Resampling.BOX)
                small.alpha_composite(fitted, ((size[0]-fitted.width)//2, (size[1]-fitted.height)//2))
        alpha = small.getchannel('A')
        small = small.convert('RGB').quantize(colors=64 if r['kind']=='background' else 24,
                    method=Image.Quantize.MAXCOVERAGE, dither=Image.Dither.NONE).convert('RGBA')
        small.putalpha(alpha)
        path = ART / 'src/base' / (r['id'] + '.png')
        small.save(path)
        r.update(processed_path=str(path.relative_to(ROOT)), raw_sha256=sha(raw_path),
                 processed_sha256=sha(path), processing=('crop generated source '+str(r['cropBox'])+'; ' if r.get('cropBox') else '')+('binary alpha cutoff '+str(r['alphaCutoff'])+'; ' if r.get('alphaCutoff') else '')+'alpha bbox >=32; BOX to logical size with '+str(r.get('padding','default'))+' padding; MAXCOVERAGE 24 colors (background64); processed alpha retained')
        prepared.append(r)
    write(ART / 'sources.json', {'source': 'openai-built-in-imagegen', 'generations': prepared})
    print(f'Prepared {len(prepared)}/{len(requests())} imagegen sources')


def nine(image, size, margins):
    """Stretch nine independent patches; corners never scale."""
    w, h = image.size
    nw, nh = size
    l, t, r, b = margins
    if nw < l+r or nh < t+b:
        raise ValueError('Target smaller than nine-slice corners')
    sx, sy = [0,l,w-r,w], [0,t,h-b,h]
    dx, dy = [0,l,nw-r,nw], [0,t,nh-b,nh]
    out = Image.new('RGBA', size)
    for yy in range(3):
        for xx in range(3):
            ww, hh = dx[xx+1]-dx[xx], dy[yy+1]-dy[yy]
            if ww and hh:
                patch = image.crop((sx[xx],sy[yy],sx[xx+1],sy[yy+1]))
                out.paste(patch.resize((ww,hh), NEAREST), (dx[xx],dy[yy]))
    return out


def recolor(image, color, brightness=1):
    rgb = np.asarray(image.convert('RGB')).astype(float)
    lum = rgb @ np.array([.299,.587,.114])
    # Preserve generated shading, map to a named original UI accent.
    level = np.clip(lum / max(float(lum.max()),1)*brightness,0,1)
    out = Image.fromarray(np.uint8(np.clip(level[:,:,None]*np.array(color),0,255))).convert('RGBA')
    out.putalpha(image.getchannel('A'))
    return out


def main_build():
    records = read(ART / 'sources.json')['generations']
    byid = {r['id']:r for r in records}
    missing = {r['id'] for r in requests()} - set(byid)
    if missing:
        raise ValueError('Pending generated sources: ' + ', '.join(sorted(missing)))
    images, assets = {}, {}

    def add(id, image, source_id, margins=None, operation='base', states=None):
        r = byid[source_id]
        image = image.convert('RGBA')
        images[id] = image
        assets[id] = dict(id=id, logicalSize=list(image.size), nineSlice=margins is not None,
            sliceMargins=margins or [0,0,0,0], sliceMarginsAtlas=[v*2 for v in margins] if margins else [0,0,0,0],
            source='openai-built-in-imagegen', prompt=r['prompt'], sourceId=source_id,
            sourceFile=r['processed_path'], sourceSha256=r['processed_sha256'], operation=operation,
            states=states or {'normal': {'asset':id}}, evidence=r['evidence'])

    def base(id):
        return Image.open(ROOT / byid[id]['processed_path']).convert('RGBA')

    for r in records:
        id = r['id']
        im = base(id)
        margin = None
        if r['kind'] in ('panel','button','tab'):
            margin = [6,6,6,6] if r['kind']=='panel' else [5,5,5,5]
        if r['kind']=='frame':
            # Normalize the generated border to a 2px rail and exact 49px aperture.
            a = np.asarray(im).copy()
            a[2:-2,2:-2] = 0
            im = Image.fromarray(a)
            margin = [2,2,2,2]
        states = None
        if id.startswith(('ClassType.','RaceType.','PerkType.','FlawType.','SkillType.','StatIcon.')):
            states = {'normal':{'asset':id}, 'selected':{'asset':id,'overlay':'ui.selection'},
                      'disabled':{'asset':id,'grayscale':1,'alpha':0.45},
                      'locked':{'asset':id,'grayscale':1,'alpha':0.45,'overlay':'ui.lock'}}
        add(id,im,id,margin,states=states)

    for key in ['ui.button','ui.tab','ui.slot','foldout.option.base']:
        for state, factor in [('pressed',.60),('disabled',.40)]:
            im=ImageEnhance.Brightness(images[key]).enhance(factor)
            if state=='disabled':
                im=ImageOps.grayscale(im).convert('RGBA');im.putalpha(images[key].getchannel('A'))
            add(key+'.'+state,im,key,assets[key]['sliceMargins'],operation=state+' brightness '+str(factor))
        assets[key]['states'].update(pressed={'asset':key+'.pressed'},disabled={'asset':key+'.disabled'})
    add('ui.selection',recolor(images['ui.slot'],[255,213,94]),'ui.slot',[2,2,2,2],operation='gold highlight')
    for key in ['ui.button','ui.tab','ui.slot','foldout.option.base']:
        assets[key]['states'].update(selected={'asset':key,'overlay':'ui.selection'},
            locked={'asset':key+'.disabled','overlay':'ui.lock'},dragging={'asset':key,'alpha':.7})
    for state,color in [('charging',[110,131,161]),('ready',[122,255,205]),('selected',[255,213,94])]:
        add('ui.slot.'+state,recolor(images['ui.slot'],color),'ui.slot',[2,2,2,2],operation=state+' tint')
        assets['ui.slot']['states'][state]={'asset':'ui.slot.'+state}
    assets['ui.slot']['states']['empty']={'asset':'ui.slot.disabled'}
    assets['ui.slot']['states']['charging'].update(iconTint=[200,200,200],clipFrom='bottom',clipFraction='charge/cooldown')
    assets['ui.slot']['states']['ready'].update(iconTint=[255,255,255],clipFraction=1)
    assets['ui.slot']['states']['disabled'].update(iconGrayscale=1,iconAlpha=.45)
    for id, color in [('hud.xp',[195,127,255]),('hud.upgrade',[90,180,255]),('hud.gold.fill',[255,209,77])]:
        add(id,recolor(images['ui.resource'],color),'ui.resource',operation='resource tint; horizontal clip')
        assets[id]['states']={'empty':{'clipFraction':0},'partial':{'clipFraction':'f'},'full':{'clipFraction':1},
                            'preview':{'clipFraction':'predicted fraction','alpha':80/255 if id!='hud.upgrade' else 120/255}}
    add('hud.resource.slot',nine(images['ui.button'],(100,10),[4,4,4,4]),'ui.button',[4,4,4,4],operation='nine slice 100x10')
    bottle=images['hud.health.bottle']
    a=np.asarray(bottle).copy();rgb=a[:,:,:3].astype(float)
    red=(rgb[:,:,0]>rgb[:,:,1]*1.45)&(rgb[:,:,0]>rgb[:,:,2]*1.35)&(rgb[:,:,0]>45)&(a[:,:,3]>0)
    # The red liquid is the largest red component; exclude reddish stopper pixels.
    unseen=set(zip(*np.where(red)));components=[]
    while unseen:
        todo=[unseen.pop()];component=[]
        while todo:
            yy,xx=todo.pop();component.append((yy,xx))
            for nxt in [(yy-1,xx),(yy+1,xx),(yy,xx-1),(yy,xx+1)]:
                if nxt in unseen:unseen.remove(nxt);todo.append(nxt)
        components.append(component)
    liquid=max(components,key=len);ys,xs=zip(*liquid)
    region=np.zeros(red.shape,dtype=bool)
    region[min(ys):max(ys)+1,min(xs):max(xs)+1]=True
    red &= region
    fill=a.copy();fill[:,:,3]=np.where(red,a[:,:,3],0)
    shell=a.copy();shell[:,:,3]=np.where(red,0,a[:,:,3])
    add('hud.health',Image.fromarray(fill),'hud.health.bottle',operation='red liquid alpha mask; bottom-up clip')
    add('hud.health.frame',Image.fromarray(shell),'hud.health.bottle',operation='glass and stopper with liquid removed')
    assets['hud.health']['fillBounds']=list(Image.fromarray(fill).getbbox())
    assets['hud.health']['fillBoundsUnits']='logical left,top,right,bottom; clip within this box, not transparent margins'
    assets['hud.health.frame']['layerAnchor']=[0,0]
    assets['hud.health']['states']={'empty':{'clipFraction':0},'partial':{'clipFraction':'f','clipFrom':'bottom'},
        'full':{'clipFraction':1},'preview':{'alpha':120/255,'clipFraction':'predicted fraction'}}
    gold=Image.new('RGBA',(80,61))
    for i in range(5):gold.alpha_composite(images['hud.gold.column'],(i*16,0))
    add('hud.gold-full',gold,'hud.gold.column',operation='repeat 16px column five times; crop to floor(gold/20) columns')
    for id,size in [('hud.top',(320,73)),('hud.bottom',(320,76))]:
        add(id,nine(images['ui.panel'],size,[6]*4),'ui.panel',[6]*4,operation='nine slice to confirmed HUD size')
    for id,size in [('ui.scroll.track',(8,48)),('ui.scroll.thumb',(8,16))]:
        add(id,nine(images['ui.button'],size,[3]*4),'ui.button',[3]*4,operation='nine slice scroll component')
    add('ui.arrow.next',ImageOps.mirror(images['ui.arrow.back']),'ui.arrow.back',operation='horizontal mirror')
    add('hud.armour.icon',images['StatIcon.5'].resize((24,24),NEAREST),'StatIcon.5',operation='reuse armour glyph')
    shield=images['StatIcon.5']
    for side,box in [('left',(0,0,25,49)),('right',(25,0,49,49))]:
        add('ui.shield.'+side,shield.crop(box),'StatIcon.5',operation='original shield split at logical x25; effect seed not native UV')
    add('ui.particle',images['ui.flare'].crop((14,14,18,18)),'ui.flare',operation='4px center patch; tintable particle quad')

    # Deterministic shelf packing. Every physical asset has one disjoint rectangle.
    atlas=Image.new('RGBA',(2048,2048));x=y=2;row_h=0
    for id in sorted(images,key=lambda k:(-images[k].height,-images[k].width,k)):
        im=images[id].resize((images[id].width*2,images[id].height*2),NEAREST)
        if x+im.width+2>2048:x=2;y+=row_h+2;row_h=0
        if y+im.height+2>2048:raise ValueError('Atlas overflow')
        atlas.paste(im,(x,y));assets[id]['rect']=[x,y,im.width,im.height]
        out=ART/'src'/(id+'.png');im.save(out)
        assets[id].update(file=str(out.relative_to(ROOT)),sha256=sha(out))
        x+=im.width+2;row_h=max(row_h,im.height)
    atlas.save(ART/'ui.png')

    layout=read(ROOT/'data/ui-layout.json')
    elements=[]
    for s in layout['artSlots']:
        elements.append(dict(assets[s['id']],asset=s['id'],nativeSizeStatus='known',originalComparison={'atlas':s['atlas'],'uv':s['uv']}))
    for e in layout['elements']:
        id=e['id'];kind=e['type'];target=None;render='asset'
        if id in assets:target=id
        elif id in ('main.loading','hud.health-value') or kind in ('text','scroll'):render='font'
        elif id=='board':render='external-atlas'
        elif id=='game-over.veil':render='solid-color'
        elif id=='unlock.reward':render='dynamic-icon'
        elif id=='hud.gold-partial':target='hud.gold.column'
        elif id.startswith('hud.skill.'):target='ui.slot'
        elif id.startswith('class.tab.'):target='ui.tab'
        elif id.startswith('foldout.option.'):target='foldout.option.base'
        elif kind in ('icon-grid',):target='ui.slot';render='repeated-slots'
        elif kind=='keyboard':target='ui.button';render='font-and-keycaps'
        elif kind=='button':target='ui.button'
        elif kind=='panel' or id=='main.confirmation':target='ui.panel'
        else:raise ValueError('Unmapped element: '+id)
        rect=e.get('rect');size=[round(rect['w'],6),round(rect['h'],6)] if rect and rect.get('w') is not None and rect.get('h') is not None else None
        row=dict(id=id,asset=target,render=render,logicalSize=size,nativeSizeStatus='known' if size else 'dynamic' if e.get('rectFormula') else 'unresolved',
                 rectFormula=e.get('rectFormula'),evidence=e['source'],originalComparison={'atlas':e['atlas'],'uv':e['uv']})
        if target:
            a=assets[target]
            row.update(rect=a['rect'],sourceSize=a['logicalSize'],nineSlice=a['nineSlice'],sliceMargins=a['sliceMargins'],
                       sliceMarginsAtlas=a['sliceMarginsAtlas'],states=a['states'],source=a['source'],prompt=a['prompt'])
        else:
            row.update(rect=None,nineSlice=False,sliceMargins=[0,0,0,0],states={},source=None,prompt=None)
        if id=='board':row['externalAtlas']='art/tiles.png'
        if id=='main.sound':row['states']={**row['states'],'on':{'overlay':'ui.sound.on'},'off':{'overlay':'ui.sound.off','logicalSize':[147,40]}}
        elements.append(row)
    manifest=dict(schemaVersion=1,atlas='ui.png',atlasSize=[2048,2048],scale=2,logicalCanvas=[320,480],
        sliceOrder=['left','top','right','bottom'],sliceUnits='logical pixels; sliceMarginsAtlas are doubled',
        sampling='nearest; no mipmaps; 2px atlas gutters',assets=list(assets.values()),elements=elements,
        notes=['assets are disjoint physical tiles; elements are logical bindings and may reuse assets',
               'logicalSize null retains unresolved or dynamic native geometry; sourceSize is only a stretchable design seed',
               'font-only, solid-color, board and dynamic reward bindings deliberately have no baked image',
               'Effect seed sizes are original design choices, not recovered native dimensions'],
        effects={'poison':'hud.status.poison','burning':'hud.status.burning','frozen':'hud.status.frozen',
                 'flare':'ui.flare','particle':'ui.particle','shieldLeft':'ui.shield.left','shieldRight':'ui.shield.right',
                 'deathCross':'ui.death-cross','helpPointer':'tooltip.pointer','selection':'ui.selection'},
        theme={'xp':'violet','gold':'amber','upgrade':'blue','health':'red'})
    write(ART/'manifest.json',manifest)
    previews(images,assets,elements)
    print(f'Built {len(assets)} assets / {len(elements)} logical bindings; RGBA 2048x2048')


def previews(images,assets,elements):
    # Labels are review-only typography; no generated or atlas asset contains labels.
    font=ImageFont.load_default(size=10)
    ids=list(images);cw,ch=120,92;cols=10
    sheet=Image.new('RGBA',(cols*cw,math.ceil(len(ids)/cols)*ch),(20,23,31,255));d=ImageDraw.Draw(sheet)
    for i,id in enumerate(ids):
        x,y=(i%cols)*cw,(i//cols)*ch
        im=images[id];preview=ImageOps.contain(im,(60,58),NEAREST)
        sheet.alpha_composite(preview,(x+8,y+3))
        if id.startswith(('ClassType.','RaceType.','PerkType.','FlawType.','SkillType.','StatIcon.')):
            sheet.alpha_composite(im.resize((32,32),NEAREST),(x+80,y+14))
        # Wrap review labels so every full ID remains readable in its own cell.
        lines=[];line=''
        for char in id:
            if d.textlength(line+char,font=font)>cw-6:
                lines.append(line);line=''
            line+=char
        lines.append(line)
        for n,line in enumerate(lines):
            d.text((x+3,y+62+n*11),line,fill='#ece5d4',font=font)
    sheet.save(ART/'contact_sheet.png')
    canvas=Image.new('RGBA',(960,480),(16,19,27,255));draw=ImageDraw.Draw(canvas)
    def put(id,x,y,size=None):
        im=images[id]
        if size:
            im=nine(im,size,assets[id]['sliceMargins']) if assets[id]['nineSlice'] else im.resize(size,NEAREST)
        canvas.alpha_composite(im,(x,y))
    def label(x,y,s):draw.text((x,y),s,font=font,fill='#eee5d2')
    put('main.background',0,0);label(18,36,'THE BELOW / MENU STUDY')
    # Demonstration menu uses known button sizes and readable spacing, not final screen layout.
    for i,(s,w) in enumerate([('CONTINUE',131),('NEW GAME',144),('CHALLENGE',142),('TUTORIAL',128),('SCORES',97)]):
        put('ui.button',8,96+i*53,(w,39));label(19,110+i*53,s)
    put('ui.sound.on',282,448);label(18,460,'320 x 480 logical')
    put('hud.top',320,0);put('hud.bottom',320,404)
    for i,sk in enumerate([0,1,28,37]):
        icon=images['SkillType.'+str(sk)].copy()
        if i==1:
            dark=ImageEnhance.Brightness(icon).enhance(.45)
            dark.paste(icon.crop((0,25,49,49)),(0,25));icon=dark
        if i==2:
            alpha=icon.getchannel('A').point(lambda v:round(v*.45))
            icon=ImageOps.grayscale(icon).convert('RGBA');icon.putalpha(alpha)
        canvas.alpha_composite(icon,(328+59*i,8))
        put(['ui.slot.ready','ui.slot.charging','ui.slot.disabled','ui.slot.selected'][i],326+59*i,6)
    for s,y,id in [('MENU',5,'ui.menu'),('STATS',33,'ui.stats')]:
        put('ui.button',562,y,(72,26));put(id,565,y+5);label(585,y+8,s)
    # Reuse A01 original tiles solely for mock board composition.
    tiles=Image.open(ROOT/'art/tiles.png').convert('RGBA');old=read(ROOT/'art/manifest.json')['tiles']
    selected=[r for r in old if r['id'] in ['potion_0','skull_0','coin_0','shield_0','sword_0','enemy_01_boss']]
    for i in range(36):
        r=selected[(i*7+i//6)%len(selected)];x,y,w,h=r['rect']
        canvas.alpha_composite(tiles.crop((x,y,x+w,y+h)).resize((53,53),NEAREST),(321+i%6*53,79+i//6*53))
    put('hud.gold-full',325,415)
    put('hud.armour.icon',435,409);label(461,424,'18 / 24')
    for id,y,f in [('hud.upgrade',445,.6),('hud.xp',463,.8)]:
        put('hud.resource.slot',430,y)
        canvas.alpha_composite(images[id].crop((0,0,int(100*f),10)),(430,y))
    put('hud.health',559,406);put('hud.health.frame',559,406);label(577,452,'32/48')
    put('hud.status.poison',609,376)
    put('ui.panel',652,14,(296,452));label(672,34,'FOLDOUT / LEVEL CHOICE')
    for i,id in enumerate(['StatIcon.0','StatIcon.1','SkillType.28','SkillType.29']):
        y=78+i*75;put('ui.button',669,y,(263,65));put('foldout.option.base',675,y+6);put(id,677,y+8)
        if i==1:put('ui.selection',674,y+5,(55,55))
        label(746,y+17,['Strength','Dexterity','Fireball','Mana potion'][i]);label(746,y+35,'Sample description')
    put('ui.button',696,407,(208,36));label(760,420,'CONFIRM')
    put('ui.scroll.track',937,77,(8,288));put('ui.scroll.thumb',937,115)
    canvas.save(ART/'preview.png')
    # Physical state samples and two unequal nine-slice sizes aid manual inspection.
    state=Image.new('RGBA',(640,240),(20,23,31,255));sd=ImageDraw.Draw(state)
    for i,key in enumerate(['ui.button','ui.button.pressed','ui.button.disabled']):
        state.alpha_composite(nine(images[key],(190,40),assets[key]['sliceMargins']),(10+210*i,22))
        sd.text((10+210*i,7),key,font=font,fill='white')
    for i,key in enumerate(['ui.slot.charging','ui.slot.ready','ui.slot.disabled','ui.slot.selected']):
        icon=images['SkillType.28'].copy()
        if i==0:
            dark=ImageEnhance.Brightness(icon).enhance(.45)
            dark.paste(icon.crop((0,25,49,49)),(0,25));icon=dark
        if i==2:
            alpha=icon.getchannel('A').point(lambda v:round(v*.45))
            icon=ImageOps.grayscale(icon).convert('RGBA');icon.putalpha(alpha)
        state.alpha_composite(icon,(12+80*i,90))
        state.alpha_composite(images[key],(10+80*i,88))
    state.alpha_composite(nine(images['ui.panel'],(210,68),[6]*4),(10,160))
    state.alpha_composite(nine(images['ui.panel'],(380,68),[6]*4),(240,160))
    state.save(ART/'states_preview.png')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepare',action='store_true')
    parser.add_argument('--prepare-only',action='store_true')
    args=parser.parse_args()
    if args.prepare or args.prepare_only:prepare()
    if not args.prepare_only:main_build()
