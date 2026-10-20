# Imagen base Node.js 20 Alpine
FROM node:20-alpine

# Directorio de trabajo en el contenedor
WORKDIR /app

# Copiar manifiestos de paquetes para optimizar la caché de capas de Docker
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el código fuente
COPY . .

# Exponer el puerto 3000 del servidor Vite
EXPOSE 3000

# Iniciar servidor de desarrollo en host 0.0.0.0 para acceso externo/Docker
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
