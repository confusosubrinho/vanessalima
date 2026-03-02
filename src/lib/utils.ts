import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Serializa um objeto para JSON-LD de forma segura, escapando caracteres que
 * podem ser usados para XSS em tags <script>.
 */
export function serializeJsonLd(data: any): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
