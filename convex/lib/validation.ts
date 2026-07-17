export function required(value:string, label:string) { if(!value.trim()) throw new Error(`${label} is required`); return value.trim(); }
export function positiveInteger(value:number, label="Quantity") { if(!Number.isInteger(value)||value<1) throw new Error(`${label} must be a positive whole number`); return value; }
