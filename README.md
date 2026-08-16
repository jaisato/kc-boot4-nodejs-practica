# Nodepop: Práctica del Módulo 2 del KC Bootcamp IV

La presente es la documentación de la API Nodepop para la práctica del 2º Módulo del Bootcamp IV de KeepCoding.

## Instalación
Instalación de las dependencias de la práctica en Express.

Ir la carpeta **root** del proyecto y ejecutar: **_npm install_**

Para inicializar la base de datos en MongoDB ejecutar desde la raíz: **_npm run installDB_**

Y para arrancar el servidor ejecutar: **_npm start_**

**NOTA:** tened en cuenta que el servidor arranca con _nodemon_, así que previamente se debe haber instalado dicho paquete. De todas formas, ya se ha incluido el paquete _nodemon_ en el fichero _package.json_ de dependencias del proyecto.

## Base de datos inicial
Al ejecutar **_npm run installDB_**, el script *install_db.js* carga los datos que inicializan el base de datos en MongoDB.

Inicialmente se cargan **3 anuncios** de diferentes tipos y precios y **1 usuario** para hacer las pruebas.

#### Credenciales usuario pruebas
**email:** _user1@gmail.com_  
**password:** _1234_  

## Documentación API
A continuación se detalla los diferentes entry points y servicios de la API Nodepop.

### Registro: /apiv1/users/signup
Servicio para registrar un usuario nuevo.

* **Entry point:** */apiv1/users/signup*
* **Parámetros:**  
	* **name:** String. *Nombre del usuario.*
	* **email:** String. *Email del usuario.*
	* **password:** String. *Contraseña del usuario.*
* **Resultado:** *objeto en formato JSON con el éxito de la petición (success) y los datos (data) o el error (error)*


### Login (Autenticación): /apiv1/users/login
Servicio para logar o autenticar a un usuario en la API.

* **Entry point:** */apiv1/users/login*
* **Parámetros:**
	* **email:** String. *Email del usuario.*
	* **password:** String. *Contraseña del usuario.*
* **Resultado:** *objeto en formato JSON con el éxito de la petición (success) y los datos (data) o el error (error)*

Si el usuario no existe o la contraseña es errónea la API devuelve un **error**. Si el usuario y la contraseña son correctos se devuelve un **token** de autenticación necesario para las peticiones que requieren de autenticación como, por ejemplo, listar los anuncios existentes en el sistema.

### Listar anuncios: /apiv1/ads
Servicio para listar los anuncios de artículos registrados en el sistema.
Este servicio requiere de autenticación *(JSON web token)*.

* **Entry point:** */apiv1/users/ads*
* **Autenticación:** el token se envía **en la cabecera**, no en la query string:

	```
	Authorization: Bearer <token>
	```

	También se acepta la cabecera `x-access-token` por compatibilidad. Enviarlo
	como `?token=...` **ya no funciona**: un token en la query string acaba escrito
	en el log de accesos, en el del proxy y en la cabecera `Referer`.

* **Parámetros:**
	* **limit:** Int. *Número de anuncios deseados (por defecto 20, máximo 100).*
	* **skip:** Int. *Número de anuncios que se escapan (entero no negativo).*
	* **fields:** String. *Propiedades o atributos del anuncio deseados (separados por coma o espacio). Ejemplo: name, price.*
	* **name:** String. _Busca los anuncios cuyo nombre de artículo empieza por **name**. Ejemplo: 'mac'_
	* **tags:** String. *Busca los anuncios que pertenecen a los tags deseados (separados por coma o espacio). Ejemplo: mobile, work.*
	* **minprice:** Float. *Busca los anuncios a partir del precio mínimo deseado. Ejemplo: 490.99*
	* **maxprice:** Float. *Busca los anuncios a partir del precio máximo deseado. Ejemplo: 490.99*
	* **onsale:** Boolean. *Busca los anuncios por tipo (en venta o búsqueda). Ejemplo: onsale: 1 (true)*
* **Resultado:** *objeto en formato JSON con el éxito de la petición (success) y los datos (data) o el error (error)*

Si se produce un error en la petición la API devuelve un **error** en formato JSON. Si no, devuelve los anuncios encontrados en un array llamado **ads**.

### Listar tags: /apiv1/tags
Servicio para listar los tags registrados en el sistema. Este servicio **NO** requiere de autenticación.

* **Entry point:** */apiv1/tags*
* **Parámetros:** *No se requiere de parámetros.*
* **Resultado:** *objeto en formato JSON con el éxito de la petición (success) y los datos (tags).*


## Configuración por entorno

| Variable | Obligatoria | Por defecto | Descripción |
|----------|-------------|-------------|-------------|
| `JWT_SECRET` | Sí | — | Secreto de firma de los tokens. La app no arranca sin él. |
| `MONGODB_URI` | No | `mongodb://localhost:27017/nodepop` | Cadena de conexión a MongoDB. |
| `PORT` | No | `3000` | Puerto de escucha. |

La URI de MongoDB estaba fijada en el código, así que la aplicación solo podía
hablar con una base de datos en la misma máquina; ahora se puede apuntar a un
servidor real sin tocar el código.

## Security notice: rotate the JWT secret

`lib/jwtAuth.js` used to carry the token-signing secret in plain text. Anyone
with a copy of this repository could forge a token for any user id, so the old
value must be considered compromised even though it is no longer in the source
— it remains in the git history.

The app now reads it from the environment and refuses to start without it:

```bash
export JWT_SECRET="$(openssl rand -hex 32)"
npm start
```

Rotating the secret invalidates every token issued with the old one, which is
the intended effect.

Passwords are now hashed with a per-password bcrypt salt. Existing hashes keep
working — bcrypt stores the salt inside the hash, so `bcrypt.compare()` verifies
old and new records alike, and no migration is needed.

## Migración obligatoria: índice único de email

`models/User.js` declara `email` como único, pero eso sólo surte efecto en bases
de datos nuevas. Una base creada por una versión anterior ya tiene un índice
`email_1` **no único**, y MongoDB no lo redefine solo — `npm run installDB`
tampoco, porque borra documentos y no índices.

Mientras ese índice siga sin ser único:

- `/signup` sigue aceptando direcciones repetidas.
- El login sólo comprueba la contraseña contra un número acotado de cuentas
  (para que nadie pueda encarecer una petición anónima sembrando duplicados),
  así que una cuenta que quede por encima de ese tope no podrá entrar. El
  servidor lo avisa por consola cuando ocurre.

Ejecuta la migración una vez por entorno, **con los registros detenidos**:

```bash
npm run migrate:unique-email -- --confirm
```

MongoDB no admite dos índices sobre la misma clave, así que el índice antiguo
tiene que eliminarse antes de construir el único: durante ese instante la
colección se queda sin índice de email. Por eso el script exige `--confirm`, y
por eso conviene parar `/signup` mientras corre. Si aun así entra un duplicado y
la reconstrucción falla, el script **restaura el índice anterior** y te lo dice,
en vez de dejar la colección sin ninguno.

Si ya hay direcciones repetidas antes de empezar, **no borra nada**: las lista y
se detiene para que decidas qué cuenta conserva cada dirección.
