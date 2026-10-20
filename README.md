# Soundwave Video Visualizer - Monorepo & Client-Side Engine

Monorepositorio para el software de generación de video de ondas sonoras client-side (**Soundwave Generator**), configurado con **Node.js 20**, **Vite**, **Docker Compose** con soporte Hot Reload y flujos de **CI/CD** automatizados en **GitHub Actions**.

---

## 🚀 Arquitectura del Proyecto

```
Soundwave Video Visualizer/
├── .github/
│   └── workflows/
│       └── ci-cd.yml             # Pipeline de CI/CD para ramas development y main
├── frontend/                     # Aplicación cliente Vite (Soundwave Generator)
│   ├── Dockerfile                # Imagen Docker basada en node:20-alpine
│   ├── .dockerignore             # Exclusión de node_modules y archivos temporales
│   ├── index.html                # Interfaz con monitor de Cross-Origin Isolation
│   ├── package.json              # Dependencias del cliente (Vite, Sass)
│   ├── vite.config.js            # Puerto 3000, host 0.0.0.0, COOP/COEP y polling
│   └── src/
│       ├── main.js               # Web Audio API y verificación de SharedArrayBuffer
│       └── style.css             # Tema oscuro moderno para visualización de audio
├── template/                     # Plantilla de estilos y assets existente (Velzon)
├── docker-compose.yml            # Orquestación de desarrollo local con Hot Reload
├── package.json                  # Paquete raíz con npm workspaces
├── .gitignore                    # Reglas de exclusión para Git
└── README.md                     # Documentación de referencia
```

---

## 🛡️ Cabeceras de Seguridad Obligatorias (Vite)

Para permitir el renderizado y codificación de video en el navegador mediante `SharedArrayBuffer`, WebCodecs y `@ffmpeg/ffmpeg` (WASM multihilo), `vite.config.js` expone el servidor local con las siguientes cabeceras estrictas:

```javascript
headers: {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp'
}
```

El frontend incluye un monitor en tiempo real que valida si `window.crossOriginIsolated === true` al cargar la aplicación.

---

## 🐳 Entorno de Desarrollo Local con Docker

El entorno utiliza una imagen ligera basada en `node:20-alpine` y monta un volumen hacia `./frontend` para reflejar cualquier cambio en el código o estilos al instante (**Hot Reload**):

### Iniciar Contenedores
```bash
docker compose up --build
```
O mediante el script de npm en la raíz:
```bash
npm run docker:up
```

La aplicación estará disponible inmediatamente en:
👉 **[http://localhost:3000](http://localhost:3000)**

### Detener Contenedores
```bash
docker compose down
# o
npm run docker:down
```

---

## 💻 Desarrollo Local sin Docker (Nativo)

1. Instalar dependencias en el frontend:
   ```bash
   cd frontend
   npm install
   ```
2. Iniciar servidor de desarrollo:
   ```bash
   npm run dev
   ```
3. Construir para producción:
   ```bash
   npm run build
   ```

---

## 🔄 Estrategia de Ramas y Pipeline de CI/CD

El archivo [.github/workflows/ci-cd.yml](.github/workflows/ci-cd.yml) implementa las siguientes reglas de negocio:

### 1. Rama `development` (Push / Pull Request)
- **Objetivo**: Validación estricta de calidad y estabilidad.
- **Acciones**:
  1. `npm ci` para instalación limpia de dependencias.
  2. `npm run build` para validar compilación estática de Vite.
  3. `docker build` para validar que la imagen de Docker compila exitosamente en los runners de GitHub.
- **Despliegue**: **Ninguno**. La rama de desarrollo no realiza despliegues.

### 2. Rama `main` (Push / Merge)
- **Objetivo**: Validación y despliegue continuo.
- **Acciones**:
  - Ejecuta las mismas validaciones de calidad (`npm ci`, `npm run build`, `docker build`).
  - Al superar los tests, ejecuta el paso de despliegue mediante `appleboy/ssh-action` para conectarse vía SSH a una VM en Google Cloud.

#### Secretos Requeridos en GitHub (Settings > Secrets and variables > Actions):
| Secreto | Descripción |
|---|---|
| `GCP_VM_IP` | Dirección IP pública o estática de la VM en Google Cloud |
| `GCP_VM_USER` | Usuario SSH configurado en la instancia de GCP |
| `GCP_SSH_PRIVATE_KEY` | Clave privada SSH (formato PEM / OpenSSH) |
