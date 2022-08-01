# Hookshot E2EE Dev Playground

A `docker-compose` file to setup a Synapse server with Hookshot and Redis.

Synapse can be reached on `127.0.0.1:8008` and a preconfigured Element is available at `127.0.0.1:8000`.

Use the following command to create an `admin` account:

```
docker-compose exec synapse register_new_matrix_user http://localhost:8008 -c /data/homeserver.yaml -u admin -a -p admin
```
