/**
 * Logger centralizado da aplicação.
 * Usado para auth, erros e diagnóstico; permite trocar por serviço externo depois.
 */
const PREFIX = '[App]';

export const appLogger = {
  info(message: string, ...args: unknown[]) {
    if (import.meta.env.DEV) {
      console.info(`${PREFIX} ${message}`, ...args);
    }
  },

  warn(message: string, ...args: unknown[]) {
    console.warn(`${PREFIX} ${message}`, ...args);
  },

  error(message: string, ...args: unknown[]) {
    console.error(`${PREFIX} ${message}`, ...args);
  },
};
