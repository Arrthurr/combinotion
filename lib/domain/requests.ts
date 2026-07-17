import { availableQuantity } from "./inventory";
import type { StockState } from "./types";
export const normalizeSchool = (value:string) => value.trim().toLocaleLowerCase().replace(/\s+/g," ");
export function reserve(state:StockState, quantity:number) { if (!Number.isInteger(quantity) || quantity < 1) throw new Error("Choose at least one copy"); if (quantity > availableQuantity(state)) throw new Error("Those copies are no longer available"); return {...state, activeReservedQuantity:state.activeReservedQuantity+quantity}; }
export const release = (state:StockState, quantity:number) => ({...state, activeReservedQuantity:Math.max(0,state.activeReservedQuantity-quantity)});
