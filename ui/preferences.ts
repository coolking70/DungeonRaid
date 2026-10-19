import type {StoragePort} from './storage';
export const preferenceDefaults={clock:false,dimming:true,smooth:true,statusStrip:true,chainSummary:true,trophyProgress:true};
export type Preferences=typeof preferenceDefaults;
export type PreferenceKey=keyof Preferences;
export function loadPreferences(storage:StoragePort):Preferences {
 const result={...preferenceDefaults};
 for(const key of Object.keys(result) as PreferenceKey[]){
  try {const value=storage.getItem(`dungeonraid.${key}`);if(value==='true'||value==='false')result[key]=value==='true';}catch{/* Keep defaults when browser storage is unavailable. */}
 }
 return result;
}
export function togglePreference(preferences:Preferences,storage:StoragePort,key:PreferenceKey) {
 preferences[key]=!preferences[key];
 try{storage.setItem(`dungeonraid.${key}`,String(preferences[key]));}catch{/* The current session can still use the selected display. */}
}
