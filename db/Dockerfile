FROM mongo:latest

ENV MONGO_INITDB_ROOT_USERNAME admin
ENV MONGO_INITDB_ROOT_PASSWORD admin
ENV MONGO_INITDB_DATABASE admin

ADD init.js /docker-entrypoint-initdb.d/init.js
