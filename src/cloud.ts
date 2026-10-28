import type {DB} from './logic';
export type User={id:string;email:string;name:string;role:'admin'|'member'};
export async function api(path:string,method='GET',body?:unknown){const r=await fetch('/api/'+path,{method,credentials:'same-origin',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const data=await r.json() as any;if(!r.ok)throw Error(data.error||'Request failed');return data}
export const getWorkspace=async()=>await api('workspace') as {data:DB|null;revision:number};
