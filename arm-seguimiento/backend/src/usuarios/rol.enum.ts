/** Roles del sistema. Una persona puede tener más de uno; en cada sesión actúa con uno solo (el rol activo). */
export enum Rol {
  PACIENTE = 'PACIENTE',
  MEDICO = 'MEDICO',
  RECEPCIONISTA = 'RECEPCIONISTA',
  ADMINISTRADOR = 'ADMINISTRADOR',
}

/** Los cuatro roles, para las rutas que cualquier usuario con sesión puede usar. */
export const CUALQUIER_ROL: Rol[] = Object.values(Rol);

/** Roles del personal del centro: todos menos el paciente. */
export const ROLES_PERSONAL: Rol[] = [Rol.MEDICO, Rol.RECEPCIONISTA, Rol.ADMINISTRADOR];
