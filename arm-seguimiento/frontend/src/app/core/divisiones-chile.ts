/**
 * División político-administrativa de Chile: 16 regiones, 56 provincias y 346 comunas.
 * Fuente: paquete `dpacl` (MIT), que recoge la división oficial vigente. Se revisó que los totales coincidan.
 */
export interface Provincia {
  nombre: string;
  comunas: string[];
}

export interface Region {
  nombre: string;
  provincias: Provincia[];
}

export const REGIONES: Region[] = [
  {
    nombre: "Arica y Parinacota",
    provincias: [
      { nombre: "Arica", comunas: ["Arica", "Camarones"] },
      { nombre: "Parinacota", comunas: ["General Lagos", "Putre"] },
    ],
  },
  {
    nombre: "Tarapacá",
    provincias: [
      { nombre: "Iquique", comunas: ["Alto Hospicio", "Iquique"] },
      { nombre: "Tamarugal", comunas: ["Camiña", "Colchane", "Huara", "Pica", "Pozo Almonte"] },
    ],
  },
  {
    nombre: "Antofagasta",
    provincias: [
      { nombre: "Antofagasta", comunas: ["Antofagasta", "Mejillones", "Sierra Gorda", "Taltal"] },
      { nombre: "El Loa", comunas: ["Calama", "Ollagüe", "San Pedro de Atacama"] },
      { nombre: "Tocopilla", comunas: ["María Elena", "Tocopilla"] },
    ],
  },
  {
    nombre: "Atacama",
    provincias: [
      { nombre: "Chañaral", comunas: ["Chañaral", "Diego de Almagro"] },
      { nombre: "Copiapó", comunas: ["Caldera", "Copiapó", "Tierra Amarilla"] },
      { nombre: "Huasco", comunas: ["Alto del Carmen", "Freirina", "Huasco", "Vallenar"] },
    ],
  },
  {
    nombre: "Coquimbo",
    provincias: [
      { nombre: "Choapa", comunas: ["Canela", "Illapel", "Los Vilos", "Salamanca"] },
      { nombre: "Elqui", comunas: ["Andacollo", "Coquimbo", "La Higuera", "La Serena", "Paihuaco", "Vicuña"] },
      { nombre: "Limarí", comunas: ["Combarbalá", "Monte Patria", "Ovalle", "Punitaqui", "Río Hurtado"] },
    ],
  },
  {
    nombre: "Valparaíso",
    provincias: [
      { nombre: "Isla de Pascua", comunas: ["Isla de Pascua"] },
      { nombre: "Los Andes", comunas: ["Calle Larga", "Los Andes", "Rinconada de Los Andes", "San Esteban"] },
      { nombre: "Marga Marga", comunas: ["Limache", "Olmué", "Quilpué", "Villa Alemana"] },
      { nombre: "Petorca", comunas: ["Cabildo", "La Ligua", "Papudo", "Petorca", "Zapallar"] },
      { nombre: "Quillota", comunas: ["Hijuelas", "La Calera", "La Cruz", "Nogales", "Quillota"] },
      { nombre: "San Antonio", comunas: ["Algarrobo", "Cartagena", "El Quisco", "El Tabo", "San Antonio", "Santo Domingo"] },
      { nombre: "San Felipe de Aconcagua", comunas: ["Catemu", "Llaillay", "Panquehue", "Putaendo", "San Felipe", "Santa María"] },
      { nombre: "Valparaíso", comunas: ["Casablanca", "Concón", "Juan Fernandéz", "Puchuncaví", "Quintero", "Valparaíso", "Viña del Mar"] },
    ],
  },
  {
    nombre: "Metropolitana de Santiago",
    provincias: [
      { nombre: "Chacabuco", comunas: ["Colina", "Lampa", "Tiltil"] },
      { nombre: "Cordillera", comunas: ["Pirque", "Puente Alto", "San José de Maipo"] },
      { nombre: "Maipo", comunas: ["Buin", "Calera de Tango", "Paine", "San Bernardo"] },
      { nombre: "Melipilla", comunas: ["Alhué", "Curacaví", "María Pinto", "Melipilla", "San Pedro"] },
      { nombre: "Santiago", comunas: ["Cerrillos", "Cerro Navia", "Conchalí", "El Bosque", "Estación Central", "Huechuraba", "Independencia", "La Cisterna", "La Granja", "La Florida", "La Pintana", "La Reina", "Las Condes", "Lo Barnechea", "Lo Espejo", "Lo Prado", "Macul", "Maipú", "Ñuñoa", "Pedro Aguirre Cerda", "Peñalolén", "Providencia", "Pudahuel", "Quilicura", "Quinta Normal", "Recoleta", "Renca", "San Miguel", "San Joaquín", "San Ramón", "Santiago", "Vitacura"] },
      { nombre: "Talagante", comunas: ["El Monte", "Isla de Maipo", "Padre Hurtado", "Peñaflor", "Talagante"] },
    ],
  },
  {
    nombre: "Libertador General Bernardo O'Higgins",
    provincias: [
      { nombre: "Cachapoal", comunas: ["Codegua", "Coínco", "Coltauco", "Doñihue", "Graneros", "Las Cabras", "Machalí", "Malloa", "Olivar", "Peumo", "Pichidegua", "Quinta de Tilcoco", "Rancagua", "Requínoa", "Rengo", "San Francisco de Mostazal", "San Vicente de Tagua Tagua"] },
      { nombre: "Cardenal Caro", comunas: ["La Estrella", "Litueche", "Marchigüe", "Navidad", "Paredones", "Pichilemu"] },
      { nombre: "Colchagua", comunas: ["Chépica", "Chimbarongo", "Lolol", "Nancagua", "Palmilla", "Peralillo", "Placilla", "Pumanque", "San Fernando", "Santa Cruz"] },
    ],
  },
  {
    nombre: "Maule",
    provincias: [
      { nombre: "Cauquenes", comunas: ["Cauquenes", "Chanco", "Pelluhue"] },
      { nombre: "Curicó", comunas: ["Curicó", "Hualañé", "Licantén", "Molina", "Rauco", "Romeral", "Sagrada Familia", "Teno", "Vichuquén"] },
      { nombre: "Linares", comunas: ["Colbún", "Linares", "Longaví", "Parral", "Retiro", "San Javier de Loncomilla", "Villa Alegre", "Yerbas Buenas"] },
      { nombre: "Talca", comunas: ["Constitución", "Curepto", "Empedrado", "Maule", "Pelarco", "Pencahue", "Río Claro", "San Clemente", "San Rafael", "Talca"] },
    ],
  },
  {
    nombre: "Ñuble",
    provincias: [
      { nombre: "Diguillín", comunas: ["Bulnes", "Chillán", "Chillán Viejo", "El Carmen", "Pemuco", "Pinto", "Quillón", "San Ignacio", "Yungay"] },
      { nombre: "Itata", comunas: ["Cobquecura", "Coelemu", "Ninhue", "Portezuelo", "Quirihue", "Ránquil", "Treguaco"] },
      { nombre: "Punilla", comunas: ["Coihueco", "Ñiquén", "San Carlos", "San Fabián", "San Nicolás"] },
    ],
  },
  {
    nombre: "Biobío",
    provincias: [
      { nombre: "Arauco", comunas: ["Arauco", "Cañete", "Contulmo", "Curanilahue", "Lebu", "Los Álamos", "Tirúa"] },
      { nombre: "Biobío", comunas: ["Alto Biobío", "Antuco", "Cabrero", "Laja", "Los Ángeles", "Muichén", "Nacimiento", "Negrele", "Quilaco", "Quilleco", "San Rosendo", "Santa Bárbara", "Tucapel", "Yumbel"] },
      { nombre: "Concepción", comunas: ["Chiguayante", "Concepción", "Coronel", "Florida", "Hualpén", "Hualqui", "Lota", "Penco", "San Pedro de la Paz", "Santa Juana", "Talcahuano", "Tomé"] },
    ],
  },
  {
    nombre: "La Araucanía",
    provincias: [
      { nombre: "Cautín", comunas: ["Carahue", "Cholchol", "Cunco", "Curarrehue", "Freire", "Galvarino", "Gorbea", "Lautaro", "Loncoche", "Melipeuco", "Nueva Imperial", "Padre Las Casas", "Perquenco", "Pitrufquén", "Pucón", "Saavedra", "Temuco", "Teodoro Schmidt", "Toltén", "Vilcún", "Villarrica"] },
      { nombre: "Malleco", comunas: ["Angol", "Collipulli", "Curacautín", "Ercilla", "Lonquimay", "Los Sauces", "Lumaco", "Purén", "Renaico", "Traiguén", "Victoria"] },
    ],
  },
  {
    nombre: "Los Ríos",
    provincias: [
      { nombre: "Ranco", comunas: ["Futrono", "La Unión", "Lago Ranco", "Río Bueno"] },
      { nombre: "Valdivia", comunas: ["Corral", "Lanco", "Los Lagos", "Máfil", "Mariquína", "Paillaco", "Panguipulli", "Valdivia"] },
    ],
  },
  {
    nombre: "Los Lagos",
    provincias: [
      { nombre: "Chiloé", comunas: ["Ancud", "Castro", "Chonchi", "Curaco de Vélez", "Dalcahue", "Puqueldón", "Queilén", "Quellón", "Quemchi", "Quinchao"] },
      { nombre: "Llanquihue", comunas: ["Calbuco", "Cochamó", "Fresia", "Frutillar", "Llanquihue", "Los Muermos", "Maullín", "Puerto Montt", "Puerto Varas"] },
      { nombre: "Osorno", comunas: ["Osorno", "Puerto Octay", "Purranque", "Puyehue", "Río Negro", "San Pablo", "San Juan de la Costa"] },
      { nombre: "Palena", comunas: ["Chaitén", "Futaleufú", "Hualaihué", "Palena"] },
    ],
  },
  {
    nombre: "Aysén del General Carlos Ibáñez del Campo",
    provincias: [
      { nombre: "Aysén", comunas: ["Aysén", "Cisnes", "Guaitecas"] },
      { nombre: "Capitán Prat", comunas: ["Cochrane", "O'Higgins", "Tortel"] },
      { nombre: "Coyhaique", comunas: ["Coyhaique", "Lago Verde"] },
      { nombre: "General Carrera", comunas: ["Chile Chico", "Río Ibáñez"] },
    ],
  },
  {
    nombre: "Magallanes y de la Antártica Chilena",
    provincias: [
      { nombre: "Antártica Chilena", comunas: ["Antártica", "Cabo de Hornos"] },
      { nombre: "Magallanes", comunas: ["Laguna Blanca", "Punta Arenas", "Río Verde", "San Gregorio"] },
      { nombre: "Tierra del Fuego", comunas: ["Porvenir", "Primavera", "Timaukel"] },
      { nombre: "Última Esperanza", comunas: ["Natales", "Torres del Paine"] },
    ],
  },
];

/** Todas las comunas, sin repetir. */
export const COMUNAS: string[] = REGIONES.flatMap((r) => r.provincias.flatMap((p) => p.comunas));

/** Comunas permitidas en minúsculas, para validar sin importar mayúsculas. */
const COMUNAS_MINUSCULAS = new Map(COMUNAS.map((c) => [c.toLowerCase(), c]));

/** Devuelve el nombre oficial de la comuna si existe (sin importar mayúsculas), o `null`. */
export function comunaOficial(nombre: string): string | null {
  return COMUNAS_MINUSCULAS.get(nombre.trim().toLowerCase()) ?? null;
}

/** Región y provincia a la que pertenece una comuna, o `null` si no existe. */
export function ubicacionDeComuna(nombre: string): { region: string; provincia: string; comuna: string } | null {
  const oficial = comunaOficial(nombre);
  if (!oficial) return null;
  for (const r of REGIONES) for (const p of r.provincias) if (p.comunas.includes(oficial)) return { region: r.nombre, provincia: p.nombre, comuna: oficial };
  return null;
}
