const ID_PATTERN = /^[a-z][a-z0-9-]*$/;

export function normalizeMenuContribution(input, group='view', owner=input?.owner??'plugin') {
  const id=String(input?.id??'').trim();
  const label=String(input?.label??'').trim();
  const selector=String(input?.selector??'').trim();
  const name=group==='view'?'View':group==='viewport'?'Viewport':String(group);
  if(!ID_PATTERN.test(id)||!label||!selector)throw new TypeError(`${name} contribution requires a valid id, label and selector`);
  return Object.freeze({
    id,group,label,description:String(input.description??''),selector,
    owner:String(owner??'plugin'),requires:Array.isArray(input.requires)?[...input.requires]:[],
    order:Number.isFinite(input.order)?input.order:1000,
  });
}

export function normalizeViewContribution(input, owner=input?.owner??'plugin') {
  return normalizeMenuContribution(input,'view',owner);
}

export function createMenuContributionRegistry(group='view') {
  if(!ID_PATTERN.test(group))throw new TypeError('Menu contribution group must be a valid id');
  const contributions=new Map(),listeners=new Set();
  const eventName=`ui:${group}-contributions-changed`;
  const label=group==='view'?'View':group==='viewport'?'Viewport':group;
  return Object.freeze({
    register(input,owner) {
      const contribution=normalizeMenuContribution(input,group,owner??input?.owner??'plugin');
      if(contributions.has(contribution.id))throw new Error(`Duplicate ${label} contribution: ${contribution.id}`);
      contributions.set(contribution.id,contribution);
      for(const listener of listeners)listener({type:'register',contribution});
      if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent(eventName));
      return()=>{
        if(!contributions.delete(contribution.id))return false;
        for(const listener of listeners)listener({type:'unregister',contribution});
        if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent(eventName));
        return true;
      };
    },
    list(){return[...contributions.values()].sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id))},
    get(id){return contributions.get(String(id))},
    subscribe(listener){if(typeof listener!=='function')throw new TypeError('listener must be a function');listeners.add(listener);return()=>listeners.delete(listener)},
  });
}

export const createViewContributionRegistry=()=>createMenuContributionRegistry('view');
export const createViewportContributionRegistry=()=>createMenuContributionRegistry('viewport');

const viewContributions=createViewContributionRegistry();
const viewportContributions=createViewportContributionRegistry();
export const registerViewContribution=(contribution,owner)=>viewContributions.register(contribution,owner);
export const listViewContributions=()=>viewContributions.list();
export const getViewContribution=id=>viewContributions.get(id)??null;
export const subscribeViewContributions=listener=>viewContributions.subscribe(listener);
export const registerViewportContribution=(contribution,owner)=>viewportContributions.register(contribution,owner);
export const listViewportContributions=()=>viewportContributions.list();
export const getViewportContribution=id=>viewportContributions.get(id)??null;
export const subscribeViewportContributions=listener=>viewportContributions.subscribe(listener);
