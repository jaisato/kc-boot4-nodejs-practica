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
* **Parámetros:**
	* **token:** String. *Token de autenticación.*
	* **limit:** Int. *Número de anuncios deseados.*
	* **skip:** Int. *Número de anuncios que se escapan.*
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

