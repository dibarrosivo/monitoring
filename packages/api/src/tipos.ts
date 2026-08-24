import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export interface CargaJwt {
  id: number;
  email: string;
  rol: 'admin' | 'operador';
}

declare module 'fastify' {
  interface FastifyInstance {
    autenticar: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: CargaJwt;
    user: CargaJwt;
  }
}

export type App = FastifyInstance;
