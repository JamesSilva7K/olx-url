import time
import hmac
import hashlib
import json
from fastapi import Request, Response, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from .config import ADMIN_SECRET_KEY
from .database import is_ip_blocked, block_ip, log_system_event, is_lead_blocked

# Sliding window / Token Bucket memory store
RATE_LIMIT_BUCKET = {}
SUSPICIOUS_PATHS = [
    "wp-admin", "wp-login", ".env", "phpmyadmin", ".git", "cgi-bin",
    "shell", "config.json", "setup.php", "xmlrpc.php", "actuator"
]

class CyberShieldMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host if request.client else "127.0.0.1"
        req_path = request.url.path.lower()

        # Se for requisição OPTIONS (CORS preflight), responde imediatamente com headers de permissão
        if request.method == "OPTIONS":
            cors_resp = Response(status_code=200)
            cors_resp.headers["Access-Control-Allow-Origin"] = "*"
            cors_resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
            cors_resp.headers["Access-Control-Allow-Headers"] = "*"
            return cors_resp

        # Arquivos estáticos (CSS, JS, imagens) passam direto sem rate limit de DDoS para carregar instantaneamente
        if "/static/" in req_path or req_path.startswith("/static") or req_path == "/favicon.ico":
            response = await call_next(request)
            response.headers["Cache-Control"] = "no-cache, must-revalidate"
            response.headers["Access-Control-Allow-Origin"] = "*"
            return response

        # 1. Checagem de IP Bloqueado
        if is_ip_blocked(client_ip):
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"error": "ACESSO_BLOQUEADO", "detail": "IP bloqueado pela blindagem do sistema supremo."}
            )

        # 2. Blindagem contra scanner de portas, sondagem de exploits e Payloads Maliciosos (SQLi, XSS, Path Traversal)
        for sus in SUSPICIOUS_PATHS:
            if sus in req_path:
                block_ip(client_ip, f"Tentativa de escaneamento de rota proibida: {req_path}")
                log_system_event("PORT_PROBE_BLOCKED", f"Varredura hostil bloqueada em {req_path}", client_ip)
                return JSONResponse(
                    status_code=status.HTTP_403_FORBIDDEN,
                    content={"error": "SHIELD_TRIGGERED", "detail": "Ataque ou escaneamento neutralizado."}
                )

        raw_query = str(request.query_params).lower()
        # Detecção de injeção e travessia de diretório
        malicious_patterns = [
            "../", "..\\", "union+select", "union%20select", "<script", "javascript:",
            "onload=", "onerror=", "exec(", "information_schema", "benchmark(", "sleep("
        ]
        if any(pat in req_path or pat in raw_query for pat in malicious_patterns):
            block_ip(client_ip, f"Tentativa de injeção ou exploit: {req_path}")
            log_system_event("INJECTION_PROBE_BLOCKED", f"Payload hostil neutralizado: {req_path} ? {raw_query}", client_ip)
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"error": "INJECTION_BLOCKED", "detail": "Tentativa de exploit/ataque bloqueada pela blindagem ativa."}
            )

        # 3. Anti-DDoS Rate Limiting por IP
        now = time.time()
        ip_data = RATE_LIMIT_BUCKET.get(client_ip, {"requests": [], "violations": 0})
        # Mantém requisições dos últimos 10 segundos
        ip_data["requests"] = [t for t in ip_data["requests"] if now - t < 10.0]

        # Limite de 50 requisições por 10 segundos (otimizado para busca ágil sem permitir flood)
        if len(ip_data["requests"]) >= 50:
            ip_data["violations"] += 1
            RATE_LIMIT_BUCKET[client_ip] = ip_data
            log_system_event("DDOS_BURST_PREVENTED", f"Taxa de requisições excedida ({len(ip_data['requests'])} reqs/10s)", client_ip)

            if ip_data["violations"] >= 3:
                block_ip(client_ip, "Ataque Flood / DDoS detectado")
                log_system_event("AUTO_IP_BAN", "IP banido automaticamente por flood DDoS", client_ip)

            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={"error": "RATE_LIMIT_EXCEEDED", "detail": "Blindagem Anti-DDoS ativa. Aguarde alguns instantes."}
            )

        ip_data["requests"].append(now)
        RATE_LIMIT_BUCKET[client_ip] = ip_data

        # 4. Checagem de Lead Bloqueado via Header
        lead_vulgo = request.headers.get("X-Lead-Vulgo")
        if lead_vulgo and is_lead_blocked(lead_vulgo):
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"error": "LEAD_BLOCKED", "detail": "Seu vulgo foi bloqueado pelo Admin Supremo."}
            )

        # Processa requisição
        response = await call_next(request)

        # 5. Camuflagem de Headers e Blindagem HTTP Reforçada
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "*"
        response.headers["Server"] = "CYBER-SHIELD-BLINDAGEM-SUPREMA-V6"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Robots-Tag"] = "noindex, nofollow, noarchive"
        response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()"

        return response

def generate_session_token(vulgo: str, role: str = "lead") -> str:
    """Gera um token criptografado HMAC-SHA256 com timestamp e role segregada."""
    timestamp = str(int(time.time()))
    payload = f"{vulgo}:{role}:{timestamp}:{ADMIN_SECRET_KEY}"
    signature = hmac.new(ADMIN_SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{vulgo}.{role}.{timestamp}.{signature}"

def verify_session_token(token: str, max_age_seconds: int = 14400) -> str | None:
    """Valida a integridade, formato e expiração (padrão 4 horas) do token assinado."""
    if not token or not isinstance(token, str):
        return None
    try:
        parts = token.split(".")
        # Novo formato: vulgo.role.timestamp.sig
        if len(parts) == 4:
            vulgo, role, timestamp, sig = parts
            ts = int(timestamp)
            if time.time() - ts > max_age_seconds:
                return None
            payload = f"{vulgo}:{role}:{timestamp}:{ADMIN_SECRET_KEY}"
            expected_sig = hmac.new(ADMIN_SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()
            if hmac.compare_digest(sig, expected_sig):
                return vulgo
        # Compatibilidade com formato legado: vulgo.timestamp.sig
        elif len(parts) == 3:
            vulgo, timestamp, sig = parts
            ts = int(timestamp)
            if time.time() - ts > max_age_seconds:
                return None
            payload = f"{vulgo}:{timestamp}:{ADMIN_SECRET_KEY}"
            expected_sig = hmac.new(ADMIN_SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()
            if hmac.compare_digest(sig, expected_sig):
                return vulgo
    except Exception:
        return None
    return None
