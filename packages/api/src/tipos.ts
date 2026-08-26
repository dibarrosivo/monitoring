import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export interface CargaJwt {
  id: number;
  email: string;
  rol: 'admin' | 'operador' | 'cliente';
  /** Solo rol 'cliente': acota todo su acceso a este cliente */
  clienteId?: number | null;
}

declare module 'fastify' {
  interface FastifyInstance {
    autenticar: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Rechaza usuarios de la app de clientes: rutas de la central solamente. */
    soloPersonal: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: CargaJwt;
    user: CargaJwt;
  }
}

export type App = FastifyInstance;
