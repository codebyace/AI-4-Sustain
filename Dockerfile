FROM python:3.11-slim

# Install Node.js
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first (heavy, cached layer)
COPY ml/requirements.txt ml/requirements.txt
RUN pip install --no-cache-dir -r ml/requirements.txt

# Install Node deps
COPY package*.json ./
RUN npm install

# Copy rest of code
COPY . .

EXPOSE 3000
CMD ["node", "server/server.js"]
