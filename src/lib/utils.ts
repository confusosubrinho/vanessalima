import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function serializeJsonLd(obj: any): string {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}
