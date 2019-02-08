FROM node:10.15.0

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . ./

EXPOSE 3001
# EXPOSE 27017

CMD [ "npm", "start" ]
