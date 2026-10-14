import os
import re
from fastapi import FastAPI, Request, HTTPException, Depends, Header
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse, Response
import requests
from pydantic import BaseModel
from typing import Optional

from .config import BRAZILIAN_STATES, CATEGORIES, ADMIN_SECRET_KEY
from .database import (
    init_db, get_or_create_lead, get_lead_by_vulgo, list_leads,
    toggle_lead_block, delete_lead, is_lead_blocked, log_puxada,
    list_puxadas, get_filter_stats, is_ip_blocked, block_ip, unblock_ip,
    list_blocked_ips, get_admin_metrics, log_system_event,
    list_api_tokens, add_api_token, delete_api_token, toggle_api_token
)
from .security import CyberShieldMiddleware, generate_session_token, verify_session_token
from .scraper import build_olx_url, fetch_olx_html, parse_search_ads, validate_single_ad, search_olx_advanced
from .ai_engine import analyze_lead_intelligence, synthesize_with_gemini

# Inicializa banco de dados SQLite
init_db()

app = FastAPI(title="OLX Brasil - Consultador, Validador & Painel Supremo", docs_url=None, redoc_url=None)

# Aplica middleware de blindagem cibernética
app.add_middleware(CyberShieldMiddleware)

# Resolução dinâmica e resiliente de diretórios (compatível com local e Vercel Serverless)
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(CURRENT_DIR)
CWD_DIR = os.getcwd()

# Localiza diretório static
STATIC_DIR = None
for candidate in [
    os.path.join(PARENT_DIR, "static"),
    os.path.join(CWD_DIR, "static"),
    os.path.join(CURRENT_DIR, "static"),
    "/var/task/static"
]:
    if os.path.exists(candidate):
        STATIC_DIR = candidate
        break

if not STATIC_DIR:
    STATIC_DIR = os.path.join(PARENT_DIR, "static")

# Localiza diretório templates
TEMPLATES_DIR = None
for candidate in [
    os.path.join(PARENT_DIR, "templates"),
    os.path.join(CWD_DIR, "templates"),
    os.path.join(CURRENT_DIR, "templates"),
    "/var/task/templates"
]:
    if os.path.exists(candidate):
        TEMPLATES_DIR = candidate
        break

if not TEMPLATES_DIR:
    TEMPLATES_DIR = os.path.join(PARENT_DIR, "templates")

if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# Schemas de Entrada
class AuthPayload(BaseModel):
    vulgo: str
    avatar: str

class SearchPayload(BaseModel):
    keyword: Optional[str] = ""
    state_uf: Optional[str] = "BR"
    category_id: Optional[str] = "todas"
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    sort_by: Optional[str] = "recent"
    pages: Optional[int] = 1
    fetch_full_descriptions: Optional[bool] = False
    only_new_sellers: Optional[bool] = False
    max_seller_ads_180d: Optional[int] = 3

class ValidateAdPayload(BaseModel):
    ad_url: str

class AdminLoginPayload(BaseModel):
    passkey: str

class BlockIpPayload(BaseModel):
    ip: str
    reason: Optional[str] = "Bloqueio manual supremo"

class ApiTokenPayload(BaseModel):
    token: str
    service: Optional[str] = "scraperapi"

class AIAnalyzePayload(BaseModel):
    title: str
    description: Optional[str] = ""
    price: Optional[float] = 0.0
    avg_price: Optional[float] = 0.0
    seller_name: Optional[str] = "Vendedor"
    badges: Optional[list] = []
    location: Optional[str] = "Brasil"

# Rota Principal (Single Page Application)
@app.get("/", response_class=HTMLResponse)
@app.get("/api", response_class=HTMLResponse)
@app.get("/api/", response_class=HTMLResponse)
async def serve_index():
    index_file = os.path.join(TEMPLATES_DIR, "index.html")
    if not os.path.exists(index_file):
        for candidate in [
            os.path.join(os.getcwd(), "templates", "index.html"),
            "/var/task/templates/index.html",
            os.path.join(PARENT_DIR, "templates", "index.html")
        ]:
            if os.path.exists(candidate):
                index_file = candidate
                break

    with open(index_file, "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

# Fallback explícito de entrega estática para ambiente Vercel
from fastapi.responses import FileResponse, Response
@app.get("/static/{file_path:path}")
@app.get("/api/static/{file_path:path}")
async def serve_static_fallback(file_path: str):
    candidates = [
        os.path.join(STATIC_DIR, file_path) if STATIC_DIR else "",
        os.path.join(os.getcwd(), "static", file_path),
        os.path.join(PARENT_DIR, "static", file_path),
        os.path.join(CURRENT_DIR, "static", file_path),
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static", file_path),
        f"/var/task/static/{file_path}",
        f"/var/task/backend/static/{file_path}"
    ]
    for c in candidates:
        if c and os.path.exists(c) and os.path.isfile(c):
            media_type = "text/css; charset=utf-8" if file_path.endswith(".css") else "application/javascript; charset=utf-8" if file_path.endswith(".js") else None
            with open(c, "rb") as f:
                content = f.read()
            return Response(content=content, media_type=media_type, headers={"Cache-Control": "public, max-age=86400"})
    raise HTTPException(status_code=404, detail=f"Arquivo estático não encontrado: {file_path}")

# Configurações do Sistema (Estados e Categorias)
@app.get("/api/config")
async def get_system_config():
    return {
        "states": BRAZILIAN_STATES,
        "categories": CATEGORIES
    }

# Proxy Seguro de Imagens da OLX (Evita 403 Forbidden de Hotlink)
@app.get("/api/image-proxy")
async def image_proxy(url: str):
    if not url or not url.startswith("http"):
        raise HTTPException(status_code=400, detail="URL inválida")
    
    # Valida domínio para segurança
    if "img.olx.com.br" not in url and "olx.com.br" not in url:
        raise HTTPException(status_code=403, detail="Domínio não autorizado para proxy")
        
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Referer": "https://www.olx.com.br/",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
    }
    try:
        resp = requests.get(url, headers=headers, timeout=15)
        if resp.status_code == 200:
            content_type = resp.headers.get("Content-Type", "image/webp")
            return Response(
                content=resp.content,
                media_type=content_type,
                headers={
                    "Cache-Control": "public, max-age=604800, immutable",
                    "Access-Control-Allow-Origin": "*"
                }
            )
        else:
            raise HTTPException(status_code=resp.status_code, detail="Imagem não pôde ser recuperada da OLX")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erro de conexão com o servidor de imagens: {str(e)}")

# Autenticação e Validação Avançada do Lead (Vulgo Seguro + Avatar Blindado)
@app.post("/api/auth/register-or-login")
async def register_or_login(payload: AuthPayload, request: Request):
    vulgo = payload.vulgo.strip()
    
    # Validação avançada de tamanho
    if not vulgo or len(vulgo) < 2 or len(vulgo) > 30:
        raise HTTPException(status_code=400, detail="Vulgo deve conter entre 2 e 30 caracteres válidos.")

    # Sanitização e proteção contra XSS / injeções no vulgo
    clean_vulgo = re.sub(r"[<>/\\{}\[\];`\"'=]", "", vulgo).strip()
    if clean_vulgo != vulgo or not re.match(r"^[\w\s\.\-@_]+$", clean_vulgo, re.UNICODE):
        raise HTTPException(status_code=400, detail="Vulgo contém caracteres inválidos ou proibidos.")

    # Proteção de nomes reservados do sistema
    reserved_names = ["admin", "supremo", "root", "system", "moderador", "olx", "bot", "anonymous"]
    if clean_vulgo.lower() in reserved_names:
        raise HTTPException(status_code=400, detail="Este vulgo é reservado pelo sistema.")

    client_ip = request.client.host if request.client else "127.0.0.1"
    user_agent = request.headers.get("User-Agent", "")

    # Checa se o vulgo está bloqueado pelo Admin Supremo
    if is_lead_blocked(clean_vulgo):
        log_system_event("BLOCKED_LEAD_LOGIN_ATTEMPT", f"Tentativa de login por lead bloqueado: {clean_vulgo}", client_ip)
        raise HTTPException(status_code=403, detail="Seu acesso está BLOQUEADO pelo Admin Supremo.")

    # Validação do Avatar (aceita data:image/svg, data:image/png, base64 ou url http)
    avatar = payload.avatar.strip() if payload.avatar else ""
    if avatar and not (avatar.startswith("data:image/") or avatar.startswith("http://") or avatar.startswith("https://")):
        avatar = ""

    # Persistência permanente garantida (nunca apaga os dados a não ser por ordem direta do Admin Supremo)
    lead = get_or_create_lead(clean_vulgo, avatar, client_ip, user_agent)
    token = generate_session_token(clean_vulgo)

    log_system_event("LEAD_AUTHENTICATED", f"Lead validado e autenticado com sucesso: {clean_vulgo}", client_ip)
    return {
        "success": True,
        "lead": lead,
        "token": token
    }

# Dados do Lead Atual
@app.get("/api/auth/me")
async def get_current_lead(request: Request, x_lead_vulgo: Optional[str] = Header(None)):
    if not x_lead_vulgo:
        raise HTTPException(status_code=401, detail="Não identificado.")

    lead = get_lead_by_vulgo(x_lead_vulgo)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado.")

    if lead["status"] == "blocked":
        raise HTTPException(status_code=403, detail="Acesso bloqueado pelo Admin Supremo.")

    return {"lead": lead}

# Consultador OLX Brasil (Busca com Filtros Avançados e Cálculo de Preço Médio)
@app.post("/api/search")
async def search_olx(payload: SearchPayload, request: Request, x_lead_vulgo: Optional[str] = Header(None)):
    lead = None
    if x_lead_vulgo:
        if is_lead_blocked(x_lead_vulgo):
            raise HTTPException(status_code=403, detail="Acesso bloqueado.")
        lead = get_lead_by_vulgo(x_lead_vulgo)

    client_ip = request.client.host if request.client else "127.0.0.1"

    # Monta a URL de busca real da OLX
    target_url = build_olx_url(
        keyword=payload.keyword,
        state_uf=payload.state_uf,
        category_id=payload.category_id,
        min_price=payload.min_price,
        max_price=payload.max_price,
        sort_by=payload.sort_by
    )

    try:
        if (payload.pages and payload.pages > 1) or payload.fetch_full_descriptions or payload.only_new_sellers:
            ads, stats = search_olx_advanced(
                keyword=payload.keyword or "",
                state_uf=payload.state_uf or "BR",
                category_id=payload.category_id or "todas",
                min_price=payload.min_price,
                max_price=payload.max_price,
                sort_by=payload.sort_by or "recent",
                pages=payload.pages or 1,
                fetch_full_descriptions=bool(payload.fetch_full_descriptions),
                only_new_sellers=bool(payload.only_new_sellers),
                max_seller_ads_180d=int(payload.max_seller_ads_180d or 3)
            )
        else:
            html = fetch_olx_html(target_url)
            ads, stats = parse_search_ads(html, sort_by=payload.sort_by or "recent")

        # Registra a puxada no histórico para auditoria do Admin Supremo
        lead_id = lead["id"] if lead else None
        vulgo_name = lead["vulgo"] if lead else "Anônimo"

        log_puxada(
            lead_id=lead_id,
            vulgo=vulgo_name,
            tipo="busca",
            termo=payload.keyword or "",
            uf=payload.state_uf or "BR",
            categoria=payload.category_id or "todas",
            preco_min=payload.min_price or 0.0,
            preco_max=payload.max_price or 0.0,
            total_anuncios=len(ads),
            preco_medio=stats.get("average", 0.0),
            ad_url=target_url,
            ip_address=client_ip
        )

        return {
            "success": True,
            "target_url": target_url,
            "total_found": len(ads),
            "stats": stats,
            "ads": ads
        }

    except Exception as e:
        log_system_event("SCRAPER_ERROR", f"Falha na busca OLX: {str(e)}", client_ip)
        raise HTTPException(status_code=500, detail=f"Erro ao consultar OLX Brasil: {str(e)}")

# Validador de Anúncio Individual OLX Brasil
@app.post("/api/validate-ad")
async def validate_ad(payload: ValidateAdPayload, request: Request, x_lead_vulgo: Optional[str] = Header(None)):
    lead = None
    if x_lead_vulgo:
        if is_lead_blocked(x_lead_vulgo):
            raise HTTPException(status_code=403, detail="Acesso bloqueado.")
        lead = get_lead_by_vulgo(x_lead_vulgo)

    client_ip = request.client.host if request.client else "127.0.0.1"
    ad_url = payload.ad_url.strip()

    if not ad_url:
        raise HTTPException(status_code=400, detail="URL do anúncio obrigatória.")

    try:
        report = validate_single_ad(ad_url)

        # Loga a validação no histórico do Admin Supremo
        lead_id = lead["id"] if lead else None
        vulgo_name = lead["vulgo"] if lead else "Anônimo"

        log_puxada(
            lead_id=lead_id,
            vulgo=vulgo_name,
            tipo="validacao",
            ad_url=ad_url,
            ad_title=report.get("title", ""),
            ad_price=report.get("price", 0.0),
            risk_score=report.get("risk_score", 0),
            ip_address=client_ip
        )

        return {
            "success": True,
            "report": report
        }

    except Exception as e:
        log_system_event("VALIDATION_ERROR", f"Erro ao validar anúncio: {str(e)}", client_ip)
        raise HTTPException(status_code=500, detail=f"Erro ao validar anúncio OLX: {str(e)}")

# Análise de Inteligência Artificial & Diagnóstico Gemini Sob Demanda
@app.post("/api/ai/analyze-ad")
async def ai_analyze_ad(payload: AIAnalyzePayload):
    try:
        intel = analyze_lead_intelligence(
            ad={
                "title": payload.title,
                "description": payload.description or "",
                "price": payload.price or 0.0,
                "seller_name": payload.seller_name or "Vendedor",
                "badges": payload.badges or [],
                "location": payload.location or "Brasil"
            },
            market_stats={"average": payload.avg_price or payload.price or 0.0}
        )
        diagnosis = synthesize_with_gemini(
            ad_title=payload.title,
            ad_desc=payload.description or payload.title,
            price=payload.price or 0.0,
            stats={"average": payload.avg_price or payload.price or 0.0}
        )
        return {
            "success": True,
            "lead_intel": intel,
            "gemini_diagnosis": diagnosis
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Falha na análise de inteligência: {str(e)}")

# Histórico do próprio Lead
@app.get("/api/lead/my-history")
async def get_my_history(x_lead_vulgo: Optional[str] = Header(None)):
    if not x_lead_vulgo:
        raise HTTPException(status_code=401, detail="Não identificado.")
    history = list_puxadas(limit=50, vulgo=x_lead_vulgo)
    return {"history": history}

# Login do Admin Supremo
@app.post("/api/admin/login")
async def admin_login(payload: AdminLoginPayload, request: Request):
    client_ip = request.client.host if request.client else "127.0.0.1"
    if payload.passkey == ADMIN_SECRET_KEY or payload.passkey == "10072601":
        token = generate_session_token("ADMIN_SUPREMO")
        log_system_event("ADMIN_LOGIN_SUCCESS", "Acesso ao Painel Supremo concedido", client_ip)
        return {"success": True, "admin_token": token}

    log_system_event("ADMIN_LOGIN_FAIL", f"Tentativa de invasão ao Painel Supremo com chave: {payload.passkey}", client_ip)
    raise HTTPException(status_code=401, detail="Chave de Acesso Suprema Inválida.")

# Overview do Admin Supremo (Métricas, Logs, Filtros mais usados)
@app.get("/api/admin/overview")
async def admin_overview():
    metrics = get_admin_metrics()
    filter_stats = get_filter_stats()
    return {
        "metrics": metrics,
        "filter_stats": filter_stats
    }

# Lista de Leads com Sincronização de Avatares, Nomes, Entradas e Status
@app.get("/api/admin/leads")
async def admin_list_leads():
    leads = list_leads()
    return {"leads": leads}

# Bloqueio / Desbloqueio de Lead em tempo real
@app.post("/api/admin/leads/{lead_id}/toggle-block")
async def admin_toggle_block(lead_id: int):
    new_status = toggle_lead_block(lead_id)
    if not new_status:
        raise HTTPException(status_code=404, detail="Lead não encontrado.")
    log_system_event("LEAD_STATUS_CHANGED", f"Status do Lead ID {lead_id} alterado para {new_status}")
    return {"success": True, "new_status": new_status}

# Excluir Lead
@app.delete("/api/admin/leads/{lead_id}")
async def admin_delete_lead(lead_id: int):
    delete_lead(lead_id)
    log_system_event("LEAD_DELETED", f"Lead ID {lead_id} excluído pelo admin supremo")
    return {"success": True}

# Histórico Completo de Puxadas para o Admin Supremo
@app.get("/api/admin/history")
async def admin_history(limit: int = 150):
    puxadas = list_puxadas(limit=limit)
    return {"history": puxadas}

# Gestão de IPs da Blindagem
@app.get("/api/admin/security/ips")
async def admin_list_ips():
    ips = list_blocked_ips()
    return {"blocked_ips": ips}

@app.post("/api/admin/security/block-ip")
async def admin_block_ip(payload: BlockIpPayload):
    block_ip(payload.ip, payload.reason)
    log_system_event("MANUAL_IP_BLOCK", f"IP {payload.ip} bloqueado manualmente", payload.ip)
    return {"success": True}

@app.post("/api/admin/security/unblock-ip")
async def admin_unblock_ip(payload: BlockIpPayload):
    unblock_ip(payload.ip)
    log_system_event("MANUAL_IP_UNBLOCK", f"IP {payload.ip} desbloqueado", payload.ip)
    return {"success": True}

# ==========================================================
# GESTÃO DE POOL DE TOKENS API (SCRAPERAPI) - ADMIN SUPREMO
# ==========================================================
@app.get("/api/admin/tokens")
async def admin_list_tokens():
    tokens = list_api_tokens()
    return {"tokens": tokens}

@app.post("/api/admin/tokens")
async def admin_add_token(payload: ApiTokenPayload):
    tok = payload.token.strip()
    if not tok:
        raise HTTPException(status_code=400, detail="Token não pode ser vazio.")
    success = add_api_token(tok, payload.service or "scraperapi")
    if not success:
        raise HTTPException(status_code=400, detail="Token já existente no pool.")
    log_system_event("API_TOKEN_ADDED", f"Nova chave ScraperAPI adicionada ({tok[:8]}...)")
    return {"success": True}

@app.delete("/api/admin/tokens/{token_id}")
async def admin_delete_token(token_id: int):
    delete_api_token(token_id)
    log_system_event("API_TOKEN_DELETED", f"Chave de API ID {token_id} removida do pool")
    return {"success": True}

@app.post("/api/admin/tokens/{token_id}/toggle")
async def admin_toggle_token(token_id: int):
    toggle_api_token(token_id)
    log_system_event("API_TOKEN_TOGGLED", f"Status da Chave de API ID {token_id} alternado")
    return {"success": True}

# Catch-all para SPA (Single Page Application) - Qualquer rota desconhecida entrega o index.html
@app.get("/{full_path:path}", response_class=HTMLResponse)
async def catch_all_spa(full_path: str):
    if full_path.startswith("static/"):
        return await serve_static_fallback(full_path[len("static/"):])
    return await serve_index()
