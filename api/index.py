from backend.app import app as fastapi_app

async def app(scope, receive, send):
    if scope["type"] == "http":
        headers = dict(scope.get("headers", []))
        matched_path = headers.get(b"x-matched-path", b"").decode("utf-8", "ignore")
        if matched_path:
            # Limpa query parameters se vierem em x-matched-path
            clean_path = matched_path.split("?")[0]
            scope["path"] = clean_path
            scope["raw_path"] = clean_path.encode("utf-8")
        elif scope.get("path") == "/api/index.py":
            # Se for chamado diretamente sem x-matched-path, restaura raiz
            scope["path"] = "/"
            scope["raw_path"] = b"/"

    await fastapi_app(scope, receive, send)
