export const availableToRequest = (onHand:number, reserved:number) => Math.max(0,onHand-reserved);
export const createsShortage = (onHand:number, reserved:number) => onHand < reserved;
