import { availableToRequest } from "./lib/availability";
export type TitleProjection = { title:string; author:string; isbn:string; quantityOnHand:number; activeReservedQuantity:number; notes?:string; coverUrl?:string };
export const projectRequestable = (titles:TitleProjection[]) => titles.map(({notes,...title})=>({...title,availableQuantity:availableToRequest(title.quantityOnHand,title.activeReservedQuantity)})).filter(title=>title.availableQuantity>0);
