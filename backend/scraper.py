import os
import re
import json
import time
import statistics
import requests
from concurrent.futures import ThreadPoolExecutor
from bs4 import BeautifulSoup
from urllib.parse import urlencode, quote
from .config import SCRAPERAPI_KEY, SCRAPERAPI_URL, BRAZILIAN_STATES, CATEGORIES
from .database import (
    get_next_available_token, record_token_request, mark_token_exhausted, 
    update_token_credits, list_api_tokens, get_system_settings
)
from .ai_engine import extract_phone_and_whatsapp, analyze_lead_intelligence, synthesize_with_gemini

import logging
from datetime import datetime, timedelta

logger = logging.getLogger("scraper")

GECKOAPI_ENDPOINT = "https://api.geckoapi.com.br/v1/extract"

def extract_with_geckoapi(keyword: str = "", state_uf: str = "SP", category_path: str = "", page: int = 1, city: str = "", region: str = "") -> list:
    """
    Executa extração profissional e avançada via GeckoAPI (https://api.geckoapi.com.br/v1/extract).
    Possui rotação automática e inteligente entre todos os tokens ativos: se um token acabar ou falhar,
    o sistema passa automaticamente para o próximo token cadastrado.
    """
    tried_tokens = []
    max_token_attempts = 5

    # Tratamento de UF e Categoria
    uf_clean = (state_uf or "SP").upper()
    if uf_clean == "BR":
        uf_clean = "SP"

    cat_clean = category_path or "todas"
    if cat_clean == "todas":
        cat_clean = ""

    payload = {
        "target": "olx.com.br",
        "type": "plp",
        "page": max(1, int(page or 1)),
        "keyword": keyword or "",
        "state": uf_clean,
        "city": city or "",
        "region": region or "",
        "categoryPath": cat_clean
    }

    for attempt in range(max_token_attempts):
        token = get_next_available_token("geckoapi", exclude_tokens=tried_tokens)
        if not token:
            logger.warning("GeckoAPI: Nenhum token adicional disponível no pool de tokens.")
            break

        tried_tokens.append(token)

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "OLX-Scraper-Intelligence/2.0"
        }

        try:
            resp = requests.post(GECKOAPI_ENDPOINT, headers=headers, json=payload, timeout=14)
            if resp.status_code in [401, 403]:
                logger.warning(f"GeckoAPI: Token {token[:12]}... esgotado ou não autorizado (HTTP {resp.status_code}). Rotacionando para próximo token...")
                mark_token_exhausted(token)
                record_token_request(token, success=False)
                update_token_credits(token, remaining=0, status="exhausted", details="Token esgotado ou sem saldo na GeckoAPI")
                continue

            if resp.status_code == 200:
                record_token_request(token, success=True)
                data = resp.json()
                raw_items = []
                if isinstance(data, list):
                    raw_items = data
                elif isinstance(data, dict):
                    raw_items = data.get("items") or data.get("ads") or data.get("data") or data.get("results") or []

                parsed_ads = []
                for item in raw_items:
                    if not isinstance(item, dict):
                        continue
                    ad_url = item.get("url") or item.get("link") or ""
                    if not ad_url:
                        continue
                    ad_id = str(item.get("id") or "")
                    if not ad_id:
                        m = re.search(r"-(\d{6,14})", ad_url)
                        ad_id = m.group(1) if m else str(int(time.time() * 1000))

                    title = item.get("title") or item.get("name") or "Anúncio OLX"
                    price_val = float(item.get("price") or item.get("price_raw") or 0.0)
                    desc = item.get("description") or item.get("desc") or ""
                    
                    # Extrai contatos
                    contact = extract_phone_and_whatsapp(title + " " + desc)

                    parsed_ads.append({
                        "id": ad_id,
                        "title": title,
                        "url": ad_url,
                        "price_raw": f"R$ {price_val:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."),
                        "price": price_val,
                        "installments": item.get("installments") or "",
                        "badges": item.get("badges") or ["GeckoAPI Extração"],
                        "seller_name": item.get("seller_name") or item.get("seller") or "Vendedor Particular",
                        "seller_score": str(item.get("seller_score") or "5.0"),
                        "location": item.get("location") or f"{city or uf_clean}, Brasil",
                        "date": item.get("date") or "Hoje",
                        "date_timestamp": time.time(),
                        "image": item.get("image") or item.get("thumbnail") or "",
                        "has_olx_pay": bool(item.get("has_olx_pay", False)),
                        "has_delivery": bool(item.get("has_delivery", False)),
                        "contact": contact,
                        "description": desc
                    })
                return parsed_ads
            else:
                logger.warning(f"GeckoAPI retornou status HTTP {resp.status_code}. Rotacionando token...")
                record_token_request(token, success=False)
                continue
        except Exception as e:
            record_token_request(token, success=False)
            logger.warning(f"GeckoAPI exception no token {token[:12]}...: {e}. Tentando próximo token...")
            continue

    return []

# Cache em memória para buscas recentes (evita consumo desnecessário de créditos ScraperAPI e acelera navegação)
HTML_CACHE = {}
CACHE_TTL_SECONDS = 300  # 5 minutos

MONTH_MAP = {
    "jan": 1, "fev": 2, "mar": 3, "abr": 4, "mai": 5, "jun": 6,
    "jul": 7, "ago": 8, "set": 9, "out": 10, "nov": 11, "dez": 12
}

def parse_olx_date(date_str: str) -> float:
    """
    Converte strings de data da OLX (ex: 'Hoje, 14:20', 'Ontem, 21:05', '12 out, 09:30', '08/10 às 15:00')
    em timestamp numérico Unix (segundos desde a epoch) para ordenação ultra-precisa e confiável.
    """
    if not date_str:
        return 0.0
    s = date_str.lower().strip()
    now = datetime.now()

    try:
        # Padrão: "Hoje, 14:32" ou "Hoje às 14:32"
        if "hoje" in s:
            m = re.search(r"(\d{1,2}):(\d{2})", s)
            if m:
                h, mnt = int(m.group(1)), int(m.group(2))
                dt = now.replace(hour=h, minute=mnt, second=0, microsecond=0)
                return dt.timestamp()
            return now.timestamp()

        # Padrão: "Ontem, 21:40" ou "Ontem às 21:40"
        if "ontem" in s:
            yesterday = now - timedelta(days=1)
            m = re.search(r"(\d{1,2}):(\d{2})", s)
            if m:
                h, mnt = int(m.group(1)), int(m.group(2))
                dt = yesterday.replace(hour=h, minute=mnt, second=0, microsecond=0)
                return dt.timestamp()
            return yesterday.timestamp()

        # Padrão: "12 out, 14:20" ou "12 de outubro"
        m_month = re.search(r"(\d{1,2})\s*(?:de\s+)?([a-z]{3})[a-z]*(?:,?\s*(\d{1,2}):(\d{2}))?", s)
        if m_month:
            day = int(m_month.group(1))
            month_str = m_month.group(2)[:3]
            month = MONTH_MAP.get(month_str, now.month)
            year = now.year if month <= now.month else now.year - 1
            h = int(m_month.group(3)) if m_month.group(3) else 12
            mnt = int(m_month.group(4)) if m_month.group(4) else 0
            dt = datetime(year, month, day, h, mnt)
            return dt.timestamp()

        # Padrão: "12/10 às 14:20" ou "12/10"
        m_slash = re.search(r"(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?", s)
        if m_slash:
            day = int(m_slash.group(1))
            month = int(m_slash.group(2))
            year = int(m_slash.group(3)) if m_slash.group(3) else now.year
            if year < 100:
                year += 2000
            m_time = re.search(r"(\d{1,2}):(\d{2})", s)
            h = int(m_time.group(1)) if m_time else 12
            mnt = int(m_time.group(2)) if m_time else 0
            dt = datetime(year, month, day, h, mnt)
            return dt.timestamp()

    except Exception:
        pass

    return 0.0

def parse_price(price_str: str) -> float:
    """Converte texto como 'R$ 4.400' ou 'R$ 1.250,50' ou 'R$ 650 em até 3x' em float seguro."""
    if not price_str:
        return 0.0
    # Procura pelo padrão monetário brasileiro R$ X.XXX,XX
    m = re.search(r"R\$\s*([\d\.,]+)", price_str)
    if not m:
        m = re.search(r"(\d+(?:[\.,]\d+)?)", price_str)
        if not m:
            return 0.0
    val_str = m.group(1).strip()
    if "." in val_str and "," in val_str:
        val_str = val_str.replace(".", "").replace(",", ".")
    elif "," in val_str:
        val_str = val_str.replace(",", ".")
    elif "." in val_str:
        parts = val_str.split(".")
        if len(parts[-1]) == 2:
            val_str = "".join(parts[:-1]) + "." + parts[-1]
        else:
            val_str = "".join(parts)
    try:
        return float(val_str)
    except ValueError:
        return 0.0

def build_olx_url(keyword: str = "", state_uf: str = "BR", category_id: str = "todas",
                  min_price: float = None, max_price: float = None, sort_by: str = "relevance",
                  page: int = 1, city_slug: str = "", neighborhood: str = "") -> str:
    """Constrói a URL oficial de consulta na OLX Brasil com suporte a cidade, bairro e paginação."""
    # Localiza o slug do estado
    state_slug = "brasil"
    for s in BRAZILIAN_STATES:
        if s["uf"].upper() == state_uf.upper():
            state_slug = s["slug"]
            break

    # Localiza a categoria
    cat_path = ""
    for c in CATEGORIES:
        if c["id"] == category_id:
            cat_path = c["path"]
            break

    # Se uma cidade/região foi selecionada (ex: sao-paulo-e-regiao/sao-paulo)
    location_path = state_slug
    if city_slug and city_slug.strip() and state_slug != "brasil":
        clean_city = city_slug.strip().strip("/")
        location_path = f"{state_slug}/{clean_city}"

    # Montagem da URL base
    base = "https://www.olx.com.br"
    if cat_path and location_path != "brasil":
        url_path = f"{base}/{cat_path}/{location_path}"
    elif cat_path:
        url_path = f"{base}/{cat_path}"
    elif location_path != "brasil":
        url_path = f"{base}/{location_path}"
    else:
        url_path = f"{base}/brasil"

    # Parâmetros de busca
    params = {}
    search_terms = []
    if keyword and keyword.strip():
        search_terms.append(keyword.strip())
    if neighborhood and neighborhood.strip():
        search_terms.append(neighborhood.strip())

    if search_terms:
        params["q"] = " ".join(search_terms)

    if min_price is not None and min_price > 0:
        params["ps"] = int(min_price)
    if max_price is not None and max_price > 0:
        params["pe"] = int(max_price)
    
    # Ordenação
    if sort_by == "recent":
        params["ot"] = 1
    elif sort_by == "cheapest":
        params["sp"] = 1
    elif sort_by == "expensive":
        params["sf"] = 1

    # Paginação (o=1, o=2, etc.)
    if page and int(page) > 1:
        params["o"] = int(page)

    query_str = urlencode(params)
    final_url = f"{url_path}?{query_str}" if query_str else url_path
    return final_url

# Fallback e motor anti-bot Cloudflare para OLX Brasil
try:
    import cloudscraper
    _CLOUDSCRAPER_INSTANCE = cloudscraper.create_scraper(browser={'browser': 'chrome', 'platform': 'windows', 'desktop': True})
except Exception:
    _CLOUDSCRAPER_INSTANCE = None

def fetch_olx_html(target_url: str) -> str:
    """
    Dispara requisição com cache de 5 min:
    1. Motor nativo Cloudscraper (sem custo, ultrarrápido e sem limites de créditos)
    2. Rotação de tokens ScraperAPI (se configurado ou adicionado pelo painel)
    3. Conexão direta com headers camuflados
    """
    now = time.time()
    if target_url in HTML_CACHE:
        cached_ts, cached_html = HTML_CACHE[target_url]
        if now - cached_ts < CACHE_TTL_SECONDS:
            return cached_html

    last_err = None

    # Detecta ambiente Serverless (Vercel) para tempos de resposta ultra-ágeis
    is_serverless = os.environ.get("VERCEL") == "1" or os.environ.get("AWS_LAMBDA_FUNCTION_NAME")
    timeout_cs = 8 if is_serverless else 18
    timeout_direct = 6 if is_serverless else 12
    timeout_scraperapi = 10 if is_serverless else 22

    def is_valid_olx_html(content: str) -> bool:
        if not content or len(content) < 500:
            return False
        # Válido se for listagem de anúncios
        if "olx-adcard" in content or "adcard" in content or "__NEXT_DATA__" in content:
            return True
        # Válido se for página de anúncio individual (ex: /sofas-e-poltronas/lindo-sofa-retratil-suede)
        if ("schema.org" in content or "olx.com.br" in content) and ("<h1" in content or "description" in content.lower()):
            return True
        return False

    # Método 1 (Primário): CloudScraper nativo para bypass da OLX com reutilização de sessão e timeout ágil
    try:
        import cloudscraper
        scraper = _CLOUDSCRAPER_INSTANCE or cloudscraper.create_scraper(browser={'browser': 'chrome', 'platform': 'windows', 'desktop': True})
        cs_resp = scraper.get(target_url, timeout=7)
        if cs_resp.status_code == 200 and is_valid_olx_html(cs_resp.text):
            HTML_CACHE[target_url] = (now, cs_resp.text)
            return cs_resp.text
    except Exception as cs_err:
        last_err = cs_err

    # Método 2: Conexão Direta com Headers Camuflados de Navegador Real (Chrome 128 / Windows 11)
    user_agents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    ]
    for ua in user_agents:
        try:
            direct_headers = {
                "User-Agent": ua,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
                "Sec-Ch-Ua": '"Not/A)Brand";v="8", "Chromium";v="128", "Google Chrome";v="128"',
                "Sec-Ch-Ua-Mobile": "?0",
                "Sec-Ch-Ua-Platform": '"Windows"',
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none",
                "Sec-Fetch-User": "?1",
                "Upgrade-Insecure-Requests": "1"
            }
            direct_resp = requests.get(target_url, headers=direct_headers, timeout=timeout_direct)
            if direct_resp.status_code == 200 and is_valid_olx_html(direct_resp.text):
                HTML_CACHE[target_url] = (now, direct_resp.text)
                return direct_resp.text
        except Exception as de:
            last_err = de

    # Método 3: Rotação de chaves ScraperAPI (APENAS se houver token ativo e não-esgotado no banco)
    tried_tokens = []
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7"
    }

    max_retries = 3 if is_serverless else 5
    for _ in range(max_retries):
        token = get_next_available_token("scraperapi", exclude_tokens=tried_tokens)
        # Nunca tenta chaves vazias ou sabidamente sem créditos
        if not token or token in tried_tokens:
            break
        tried_tokens.append(token)

        payload = {
            "api_key": token,
            "url": target_url,
            "follow_redirect": "false",
            "retry_404": "true",
            "device_type": "desktop",
            "keep_headers": "true"
        }

        try:
            resp = requests.get(SCRAPERAPI_URL, params=payload, headers=headers, timeout=timeout_scraperapi)
            if resp.status_code in [401, 403]:
                mark_token_exhausted(token)
                record_token_request(token, success=False)
                update_token_credits(token, remaining=0, status="exhausted")
                continue
            
            resp.raise_for_status()
            record_token_request(token, success=True)
            
            rem_str = resp.headers.get("sa-credits-remaining") or resp.headers.get("x-credits-remaining")
            if rem_str and rem_str.isdigit():
                update_token_credits(token, remaining=int(rem_str), status="ready")

            HTML_CACHE[target_url] = (now, resp.text)
            return resp.text
        except requests.exceptions.RequestException as e:
            record_token_request(token, success=False)
            last_err = e
            continue

    # Se todos os métodos falharam, relança exceção contextual limpa
    if last_err:
        raise last_err
    raise RuntimeError("Os servidores da OLX Brasil temporariamente não retornaram anúncios para este filtro.")

def clean_and_structure_olx_description(raw_desc: str) -> str:
    """
    Limpa ruídos, scripts e blocos de boilerplate de cabeçalho/rodapé da OLX,
    estruturando a descrição do produto de forma organizada, legível e profissional.
    """
    if not raw_desc:
        return ""

    # Remove tags HTML remanescentes
    text = re.sub(r"<[^>]+>", " ", raw_desc)
    # Decodifica quebras de linha escapadas
    text = text.replace("\\n", "\n").replace("\\r", "").replace("\r", "")

    # Limpa tentativas de ofuscação com pontos de interrogação entre dígitos: ?1?9?8?0? -> 1980...
    text = re.sub(r"\?(\d)\?", r"\1", text)
    text = re.sub(r"(\d)\?(\d)", r"\1\2", text)
    text = re.sub(r"(\d)\?(\d)", r"\1\2", text) # segunda passagem para encadeados

    # Normaliza sequências exageradas de travessões ou traços (e.g. -------------)
    text = re.sub(r"[-_=]{3,}", " — ", text)

    # Padrões comuns de boilerplates e menus da OLX capturados acidentalmente
    BOILERPLATES = [
        r"Ir para o menu principal.*?(?=Garantia da OLX|Detalhes|\Z)",
        r"Ir para o conteúdo da página",
        r"Ir para o rodapé",
        r"Menu\s*Página inicial.*?(?=Chat|Notificações|Detalhes|\Z)",
        r"Plano Profissional.*?Notificações",
        r"publicidade",
        r"Dicas de segurança.*?(?=Exibir mais dicas|Denunciar anúncio|\Z)",
        r"Exibir mais dicas",
        r"Denunciar anúncio",
        r"Ajuda\s*Dicas de segurança.*?(?=\Z)",
        r"Calcule o frete.*?(?=publicidade|Detalhes|\Z)",
        r"R\$\s*\d+OFF.*?etapa de pagamento\.\s*\*?Cupons limitados\.\s*Copiar",
        r"Mais opções de parcelamento",
        r"Não sei meu CEP",
        r"Grupo OLXZAP.*?(?=\Z)",
        r"Viva Real\s*©\s*Bom Negócio.*?(?=\Z)",
        r"Facebook\s*YouTube\s*TikTok\s*Instagram.*?(?=\Z)",
        r"Termos de uso\s*Política de privacidade.*?(?=\Z)"
    ]

    for b in BOILERPLATES:
        text = re.sub(b, "\n", text, flags=re.IGNORECASE | re.DOTALL)

    # Limpa linhas vazias repetidas e formata de modo profissional
    raw_lines = [l.strip() for l in text.split("\n")]
    filtered_lines = []
    for l in raw_lines:
        if not l:
            continue
        # Ignora linhas com resíduos irrelevantes
        if l.lower() in ["publicidade", "menu", "buscar", "notificações", "chat"]:
            continue
        # Limpa espaços duplicados
        clean_l = re.sub(r"[ \t]+", " ", l)
        filtered_lines.append(clean_l)

    structured = "\n\n".join(filtered_lines).strip()
    return structured or raw_desc.strip()

def parse_search_ads(html_content: str, sort_by: str = "recent", min_price: float = None, max_price: float = None):
    """Extrai os anúncios reais da página da OLX Brasil ordenados do mais recente para o mais antigo por padrão."""
    soup = BeautifulSoup(html_content, "html.parser")
    ads = []
    prices = []

    sections = soup.find_all("section", class_=lambda c: c and "olx-adcard" in c)

    for sec in sections:
        try:
            # Link e Título
            # Link e Título
            link_tag = sec.find("a", attrs={"data-testid": "adcard-link"}) or sec.find("a", class_=lambda c: c and "olx-adcard__link" in c)
            if not link_tag or not link_tag.get("href"):
                # Fallback para qualquer tag 'a' que possua href com olx.com.br
                link_tag = sec.find("a", href=lambda h: h and ("olx.com.br" in h or "/anuncio" in h))
            if not link_tag or not link_tag.get("href"):
                continue

            url = link_tag.get("href")
            if url.startswith("/"):
                url = "https://www.olx.com.br" + url

            # Extrai ID do anúncio
            id_match = re.search(r"-(\d{6,14})(?:\?|$)", url)
            ad_id = id_match.group(1) if id_match else ""

            title_tag = sec.find("h2", class_=lambda c: c and "olx-adcard__title" in c) or sec.find("h2")
            if not title_tag:
                title_tag = sec.find(["h2", "h3", "span"], attrs={"data-testid": "adcard-title"})
            title = title_tag.get_text(strip=True) if title_tag else (link_tag.get("title") or "Anúncio OLX")

            # Preço: prioriza tag oficial da OLX, depois busca h3 e fallback regex
            price_tag = sec.find("h3", class_=lambda c: c and "olx-adcard__price" in c) or sec.find("h3")
            if not price_tag:
                price_tag = sec.find(lambda e: e.name in ["h3", "span", "p"] and "R$" in e.get_text() if e.get_text() else False)
            price_raw = price_tag.get_text(strip=True) if price_tag else ""
            price_val = parse_price(price_raw)
            if price_val == 0.0:
                m_rgx = re.search(r"R\$\s*[\d\.,]+", sec.get_text())
                if m_rgx:
                    price_raw = m_rgx.group(0)
                    price_val = parse_price(price_raw)
            if price_val > 0:
                prices.append(price_val)

            # Parcelamento
            installments = ""
            inst_tag = sec.find("div", attrs={"data-testid": "adcard-price-info"}) or sec.find(class_=lambda c: c and "installments" in c.lower() if c else False)
            if inst_tag:
                installments = inst_tag.get_text(strip=True)

            # Selos / Badges (Frete grátis, Garantia da OLX, Entrega fácil, etc.)
            raw_badges = []
            for b in sec.find_all(["div", "span"], class_=lambda c: c and ("olx-core-badge" in c or "badge" in c.lower())):
                # Ignora elementos que tenham outros badges como filhos para não concatenar textos
                if b.find(["div", "span"], class_=lambda c: c and ("olx-core-badge" in c or "badge" in c.lower())):
                    continue
                btxt = b.get_text(strip=True)
                if btxt and len(btxt) < 30 and btxt not in raw_badges:
                    raw_badges.append(btxt)
            
            # Remove duplicatas e strings compostas redundantes
            badges = []
            for b in raw_badges:
                if any(b != other and other in b for other in raw_badges):
                    continue
                badges.append(b)

            # Vendedor e Avaliação
            seller_name = ""
            seller_score = "5.0"
            s_name_tag = sec.find("span", class_=lambda c: c and "transactionalSellerName" in c) or sec.find(class_=lambda c: c and "seller" in c.lower() if c else False)
            if s_name_tag and s_name_tag.get_text(strip=True):
                seller_name = s_name_tag.get_text(strip=True)
            s_score_tag = sec.find("span", class_=lambda c: c and "transactionalSellerScore" in c) or sec.find(class_=lambda c: c and "rating" in c.lower() if c else False)
            if s_score_tag and s_score_tag.get_text(strip=True):
                seller_score = s_score_tag.get_text(strip=True)
            if not seller_name:
                seller_name = "Vendedor Particular"

            # Localização
            loc_tag = sec.find("p", class_=lambda c: c and "olx-adcard__location" in c) or sec.find(class_=lambda c: c and "location" in c.lower() if c else False)
            location = loc_tag.get_text(strip=True) if loc_tag else "Brasil"

            # Data de publicação
            date_tag = sec.find("p", class_=lambda c: c and "olx-adcard__date" in c) or sec.find(class_=lambda c: c and "date" in c.lower() if c else False)
            date_str = date_tag.get_text(strip=True) if date_tag else "Recente"

            # Imagem do anúncio com resolução real e fallback seguro
            image_url = ""
            pic = sec.find("picture")
            if pic:
                source = pic.find("source")
                if source and source.get("srcset"):
                    image_url = source.get("srcset").split(",")[0].split(" ")[0]
                elif pic.find("img"):
                    image_url = pic.find("img").get("src") or pic.find("img").get("data-src")
            if not image_url:
                img_tag = sec.find("img")
                if img_tag:
                    image_url = img_tag.get("src") or img_tag.get("data-src") or ""
            
            if image_url and image_url.startswith("//"):
                image_url = "https:" + image_url

            # Garantia / OLX Pay / Frete
            has_olx_pay = any("garantia" in b.lower() or "10x" in b.lower() or "pagamento seguro" in b.lower() for b in badges)
            has_delivery = any("entrega" in b.lower() or "frete" in b.lower() or "envio" in b.lower() for b in badges)

            # Detecção Neural de WhatsApp/Telefone no Título
            contact = extract_phone_and_whatsapp(title)

            # Timestamp para ordenação cronológica precisa (mais recentes primeiro)
            date_ts = parse_olx_date(date_str)

            # Validação estrita de Preço Mínimo e Máximo
            if min_price is not None and min_price > 0:
                if price_val > 0 and price_val < min_price:
                    continue
            if max_price is not None and max_price > 0:
                if price_val > 0 and price_val > max_price:
                    continue

            ads.append({
                "id": ad_id,
                "title": title,
                "url": url,
                "price_raw": price_raw,
                "price": price_val,
                "installments": installments,
                "badges": badges,
                "seller_name": seller_name,
                "seller_score": seller_score,
                "location": location,
                "date": date_str,
                "date_timestamp": date_ts,
                "image": image_url,
                "has_olx_pay": has_olx_pay,
                "has_delivery": has_delivery,
                "contact": contact
            })
        except Exception:
            continue

    # Cálculo da Média de Preço e Estatísticas
    stats = calculate_price_stats(prices)

    # Classificação de Anomalia de Preço por Anúncio
    avg = stats["average"]
    for a in ads:
        if avg > 0 and a["price"] > 0:
            diff_pct = round(((a["price"] - avg) / avg) * 100, 1)
            diff_val = round(abs(a["price"] - avg), 2)
            a["diff_pct"] = diff_pct
            a["diff_val"] = diff_val

            if a["price"] < (avg * 0.45):
                a["price_tier"] = "alerta_baixo"
                a["price_badge"] = "Preço Suspeito (-55%+)"
                a["diff_label"] = f"{abs(diff_pct):.0f}% abaixo da média (R$ {diff_val:,.2f} a menos)"
            elif a["price"] < (avg * 0.85):
                a["price_tier"] = "oportunidade"
                a["price_badge"] = f"Ótimo Preço ({abs(diff_pct):.0f}% abaixo)"
                a["diff_label"] = f"{abs(diff_pct):.0f}% abaixo da média (R$ {diff_val:,.2f} de economia)"
            elif a["price"] > (avg * 1.5):
                a["price_tier"] = "alto"
                a["price_badge"] = "Acima da Média"
                a["diff_label"] = f"{diff_pct:.0f}% acima da média"
            else:
                a["price_tier"] = "medio"
                a["price_badge"] = "Na Média de Mercado"
                a["diff_label"] = "Na média de mercado"
        else:
            a["diff_pct"] = 0
            a["diff_val"] = 0
            a["price_tier"] = "normal"
            a["price_badge"] = "Preço Padrão"
            a["diff_label"] = "Preço a consultar"

        # Inteligência Automática do Lead em Tempo Real
        try:
            intel = analyze_lead_intelligence(a, market_stats=stats)
            a["lead_intel"] = intel
            a["lead_score"] = intel.get("lead_score", 50)
            a["lead_category"] = intel.get("lead_category", "PROSPECTO REGULAR")
            a["lead_badge_class"] = intel.get("lead_badge_class", "lead-regular")
            a["is_top_deal"] = intel.get("is_top_deal", False)
            a["deal_tag"] = intel.get("deal_tag", "")
            if not a.get("contact") or not a["contact"].get("has_phone"):
                if intel.get("contact") and intel["contact"].get("has_phone"):
                    a["contact"] = intel["contact"]
        except Exception:
            pass

    # Ordenação dos mais recentes para os mais antigos
    if sort_by == "recent":
        ads.sort(key=lambda x: x.get("date_timestamp", 0.0), reverse=True)
    elif sort_by == "cheapest":
        ads.sort(key=lambda x: x.get("price", float('inf')))
    elif sort_by == "expensive":
        ads.sort(key=lambda x: x.get("price", 0.0), reverse=True)

    return ads, stats

def search_olx_advanced(keyword: str = "", state_uf: str = "BR", category_id: str = "todas",
                        min_price: float = None, max_price: float = None, sort_by: str = "relevance",
                        pages: int = 1, fetch_full_descriptions: bool = False,
                        only_new_sellers: bool = False, only_with_contact: bool = True,
                        max_seller_ads_180d: int = 3, city_slug: str = "", neighborhood: str = ""):
    """
    Executa busca avançada multi-página com:
    - Paginação real de 1 até 30 páginas
    - Filtro antecipado de 'Somente vendedores novos (0 vendas)'
    - Extração profunda de descrições completas e telefones/WhatsApp via ThreadPool
    - Validação estrita de contato (apenas anúncios com Telefone, WhatsApp ou E-mail reais)
    - Filtro por Cidade e Bairro com análise inteligente
    """
    is_serverless = os.environ.get("VERCEL") == "1" or os.environ.get("AWS_LAMBDA_FUNCTION_NAME")
    # No Vercel sem streaming, até 3 páginas conseguem responder no timeout; em localhost, respeita até 30 páginas completas
    max_p = 3 if is_serverless else 30
    clamped_pages = max(1, min(max_p, int(pages or 1)))
    all_ads = []
    seen_ids = set()

    # Consulta configurações de Motor Principal e Secundário
    sys_settings = get_system_settings()
    primary_engine = sys_settings.get("primary_engine", "cloudscraper")
    secondary_engine = sys_settings.get("secondary_engine", "scraperapi")

    # Se GeckoAPI estiver como motor principal ou ativo e possuir token:
    if primary_engine == "geckoapi":
        try:
            gecko_ads = extract_with_geckoapi(
                keyword=keyword,
                state_uf=state_uf,
                category_path=category_id if category_id != "todas" else "",
                page=1,
                city=city_slug,
                region=neighborhood
            )
            if gecko_ads:
                all_ads.extend(gecko_ads)
                for a in gecko_ads:
                    if a.get("id"):
                        seen_ids.add(a["id"])
        except Exception as ge:
            logger.warning(f"Falha no motor primário GeckoAPI ({ge}), alternando para secundário: {secondary_engine}")

    # Se ainda não possui anúncios (motor primário era cloudscraper/scraperapi ou geckoapi falhou):
    if not all_ads:
        for page_num in range(1, clamped_pages + 1):
            target_url = build_olx_url(
                keyword=keyword,
                state_uf=state_uf,
                category_id=category_id,
                min_price=min_price,
                max_price=max_price,
                sort_by=sort_by,
                page=page_num,
                city_slug=city_slug,
                neighborhood=neighborhood
            )
            try:
                html = fetch_olx_html(target_url)
                page_ads, _ = parse_search_ads(html, sort_by=sort_by, min_price=min_price, max_price=max_price)
                if not page_ads:
                    # Se o motor principal falhou na primeira página e o secundário for geckoapi, tenta o secundário
                    if page_num == 1 and secondary_engine == "geckoapi":
                        logger.info("Tentando motor secundário GeckoAPI para resgate de anúncios...")
                        gecko_fallback = extract_with_geckoapi(keyword=keyword, state_uf=state_uf, category_path=category_id, page=1, city=city_slug, region=neighborhood)
                        if gecko_fallback:
                            page_ads = gecko_fallback
                    if not page_ads:
                        break

                for a in page_ads:
                    if a.get("id") and a["id"] in seen_ids:
                        continue
                    if a.get("id"):
                        seen_ids.add(a["id"])

                    # Validação e Corte Estrito de Preço Mínimo e Máximo (Regra de Negócio)
                    if min_price is not None and min_price > 0:
                        if a["price"] > 0 and a["price"] < min_price:
                            continue
                    if max_price is not None and max_price > 0:
                        if a["price"] > 0 and a["price"] > max_price:
                            continue

                    # Filtro prévio: descarta contas profissionais e lojas
                    if only_new_sellers:
                        badges_lower = [b.lower() for b in a.get("badges", [])]
                        if any("pro" in b or "loja" in b or "revenda" in b or "distribuidor" in b for b in badges_lower):
                            continue
                        if a.get("seller_name") and ("loja" in a["seller_name"].lower() or "store" in a["seller_name"].lower()):
                            continue

                    all_ads.append(a)

            except Exception as p_err:
                logger.warning(f"Erro ao consultar página {page_num} na OLX: {p_err}")
                # Se a primeira página falhar, registra e tenta prosseguir se houver mais páginas
                if page_num == 1 and clamped_pages > 1:
                    continue
                break

    # Guarda todos os preços escaneados do mercado real antes de subamostragens/filtros
    market_prices = [a["price"] for a in all_ads if a.get("price", 0) > 0]

    # Se a flag 'Buscar Descrições Completas' ou 'Somente vendedores novos' estiver ativa:
    if (fetch_full_descriptions or only_new_sellers) and all_ads:
        # Limite otimizado para não estourar o tempo limite de execução (Serverless Vercel / Gateway)
        is_serverless = os.environ.get("VERCEL") == "1" or os.environ.get("AWS_LAMBDA_FUNCTION_NAME")
        limit_count = 6 if is_serverless else 15
        target_sub_ads = all_ads[:limit_count]

        def enrich_ad(ad_item):
            try:
                ad_html = fetch_olx_html(ad_item["url"])
                ad_soup = BeautifulSoup(ad_html, "html.parser")

                # 1. Tenta extrair via dados estruturados JSON-LD primeiro (mais confiável)
                desc = ""
                for s in ad_soup.find_all("script", type="application/ld+json"):
                    try:
                        ld_data = json.loads(s.string)
                        if isinstance(ld_data, dict) and ld_data.get("@type") == "Product":
                            if ld_data.get("description"):
                                desc = re.sub(r"<[^>]+>", " ", ld_data.get("description")).strip()
                                break
                    except Exception:
                        continue

                # Fallback para seletores HTML
                if not desc:
                    desc_tag = (
                        ad_soup.find("span", attrs={"data-qa": "ad-description"}) or
                        ad_soup.find("div", class_=lambda c: c and "description" in c.lower() if c else False) or
                        ad_soup.find("p", class_=lambda c: c and "description" in c.lower() if c else False)
                    )
                    if desc_tag:
                        desc = desc_tag.get_text(separator=" ", strip=True)

                if desc:
                    desc_clean = clean_and_structure_olx_description(desc)
                    ad_item["description"] = desc_clean
                    contact = extract_phone_and_whatsapp(desc_clean + " " + ad_item["title"] + " " + ad_html)
                    if contact and contact.get("has_phone"):
                        ad_item["contact"] = contact

                # 2. Análise do Perfil do Vendedor (Vendas Concluídas & Anúncios nos últimos 180 dias)
                sales_completed = 0
                active_ads_180d = 0
                is_pro_seller = False

                # Busca contadores no HTML
                for hist in ad_soup.find_all(["div", "span", "p"], class_=lambda c: c and ("seller" in c.lower() or "advc" in c.lower()) if c else False):
                    htxt = hist.get_text(strip=True).lower()
                    if "conclu" in htxt or "venda" in htxt:
                        m_val = re.search(r"(\d+)\s*venda", htxt)
                        if m_val:
                            sales_completed = max(sales_completed, int(m_val.group(1)))
                    if "anúncio" in htxt or "publicado" in htxt:
                        m_ads = re.search(r"(\d+)\s*anúncio", htxt)
                        if m_ads:
                            active_ads_180d = max(active_ads_180d, int(m_ads.group(1)))
                    if "loja" in htxt or "pro" in htxt or "profissional" in htxt:
                        is_pro_seller = True

                # Guarda dados do vendedor para sincronização com o card e métricas
                ad_item["sales_completed"] = sales_completed
                ad_item["active_ads_180d"] = active_ads_180d
                ad_item["is_new_seller"] = (sales_completed == 0 and not is_pro_seller)

                if only_new_sellers:
                    # Descartar se já fez vendas anteriores ou for lojista
                    if sales_completed > 0 or is_pro_seller:
                        ad_item["_discard"] = True
                    # Descartar se exceder o limite de anúncios dos últimos 180 dias
                    elif max_seller_ads_180d and active_ads_180d > int(max_seller_ads_180d):
                        ad_item["_discard"] = True

            except Exception:
                pass
            return ad_item

        # Executa enriquecimento com concorrência otimizada apenas sobre a amostra selecionada
        with ThreadPoolExecutor(max_workers=6 if is_serverless else 8) as executor:
            list(executor.map(enrich_ad, target_sub_ads))

    # Se a flag 'only_with_contact' estiver ativa (padrão) e ainda não tiver inspecionado anúncios
    if only_with_contact and all_ads:
        # Se os anúncios ainda não foram enriquecidos com a descrição completa, inspeciona uma amostra prioritária
        unenriched = [a for a in all_ads if not a.get("description")]
        if unenriched:
            is_serverless = os.environ.get("VERCEL") == "1" or os.environ.get("AWS_LAMBDA_FUNCTION_NAME")
            sample_to_check = unenriched[:8 if is_serverless else 15]

            def quick_enrich_contact(ad_item):
                try:
                    ad_html = fetch_olx_html(ad_item["url"])
                    ad_soup = BeautifulSoup(ad_html, "html.parser")
                    desc = ""
                    for s in ad_soup.find_all("script", type="application/ld+json"):
                        try:
                            ld_data = json.loads(s.string)
                            if isinstance(ld_data, dict) and ld_data.get("@type") == "Product" and ld_data.get("description"):
                                desc = re.sub(r"<[^>]+>", " ", ld_data.get("description")).strip()
                                break
                        except Exception:
                            continue
                    if not desc:
                        desc_tag = (
                            ad_soup.find("span", attrs={"data-qa": "ad-description"}) or
                            ad_soup.find("div", class_=lambda c: c and "description" in c.lower() if c else False) or
                            ad_soup.find("p", class_=lambda c: c and "description" in c.lower() if c else False)
                        )
                        if desc_tag:
                            desc = desc_tag.get_text(separator=" ", strip=True)

                    if desc:
                        desc_clean = clean_and_structure_olx_description(desc)
                        ad_item["description"] = desc_clean
                        c = extract_phone_and_whatsapp(desc_clean + " " + ad_item["title"] + " " + ad_html)
                        if c and (c.get("has_phone") or c.get("has_email") or c.get("has_contact")):
                            ad_item["contact"] = c
                except Exception:
                    pass
                return ad_item

            with ThreadPoolExecutor(max_workers=6 if is_serverless else 8) as executor:
                list(executor.map(quick_enrich_contact, sample_to_check))

    # Filtragem Inteligente de Leads Conforme Seleções do Usuário:
    if only_new_sellers:
        all_ads = [a for a in all_ads if not a.get("_discard")]

    # REGRA SUPREMA: Se only_with_contact for True, apenas anúncios com Telefone, WhatsApp ou E-mail real passam
    contact_filtered_out = 0
    if only_with_contact:
        verified_contact_ads = []
        for a in all_ads:
            c = a.get("contact") or {}
            has_valid_contact = bool(c.get("has_phone") or c.get("has_email") or c.get("has_contact"))
            if has_valid_contact:
                verified_contact_ads.append(a)
            else:
                contact_filtered_out += 1
        all_ads = verified_contact_ads

    # Estatísticas de mercado reais (prioriza todo o pool varrido na OLX)
    prices_for_stats = market_prices if len(market_prices) >= len(all_ads) and len(market_prices) > 0 else [a["price"] for a in all_ads if a["price"] > 0]
    stats = calculate_price_stats(prices_for_stats)

    avg = stats["average"]
    for a in all_ads:
        if avg > 0 and a["price"] > 0:
            diff_pct = round(((a["price"] - avg) / avg) * 100, 1)
            diff_val = round(abs(a["price"] - avg), 2)
            a["diff_pct"] = diff_pct
            a["diff_val"] = diff_val

            if a["price"] < (avg * 0.45):
                a["price_tier"] = "alerta_baixo"
                a["price_badge"] = "Preço Suspeito (-55%+)"
                a["diff_label"] = f"{abs(diff_pct):.0f}% abaixo da média (R$ {diff_val:,.2f} a menos)"
            elif a["price"] < (avg * 0.85):
                a["price_tier"] = "oportunidade"
                a["price_badge"] = f"Ótimo Preço ({abs(diff_pct):.0f}% abaixo)"
                a["diff_label"] = f"{abs(diff_pct):.0f}% abaixo da média (R$ {diff_val:,.2f} de economia)"
            elif a["price"] > (avg * 1.5):
                a["price_tier"] = "alto"
                a["price_badge"] = "Acima da Média"
                a["diff_label"] = f"{diff_pct:.0f}% acima da média"
            else:
                a["price_tier"] = "medio"
                a["price_badge"] = "Na Média de Mercado"
                a["diff_label"] = "Na média de mercado"
        else:
            a["diff_pct"] = 0
            a["diff_val"] = 0
            a["price_tier"] = "normal"
            a["price_badge"] = "Preço Padrão"
            a["diff_label"] = "Preço a consultar"

        # Inteligência Automática do Lead em Tempo Real
        try:
            intel = analyze_lead_intelligence(a, market_stats=stats)
            a["lead_intel"] = intel
            a["lead_score"] = intel.get("lead_score", 50)
            a["lead_category"] = intel.get("lead_category", "PROSPECTO REGULAR")
            a["lead_badge_class"] = intel.get("lead_badge_class", "lead-regular")
            a["is_top_deal"] = intel.get("is_top_deal", False)
            a["deal_tag"] = intel.get("deal_tag", "")
            if not a.get("contact") or not a["contact"].get("has_contact"):
                if intel.get("contact") and intel["contact"].get("has_contact"):
                    a["contact"] = intel["contact"]
        except Exception:
            pass

    # Diagnóstico Inteligente e Transparente de Auditoria para o Lead
    diag = {
        "requested_pages": int(pages or 1),
        "scanned_pages": clamped_pages,
        "scanned_raw_count": len(seen_ids),
        "filtered_count": len(all_ads),
        "contact_filtered_out": contact_filtered_out,
        "only_with_contact": bool(only_with_contact),
        "min_price_applied": min_price,
        "max_price_applied": max_price,
        "fetch_full_descriptions": bool(fetch_full_descriptions),
        "only_new_sellers": bool(only_new_sellers),
        "message": ""
    }

    if len(all_ads) == 0:
        if len(seen_ids) == 0:
            diag["status"] = "olx_no_results"
            diag["message"] = "Nenhum anúncio existe na OLX Brasil para os termos e localização solicitados."
        elif contact_filtered_out > 0:
            diag["status"] = "no_contact_info"
            diag["message"] = f"A OLX retornou {len(seen_ids)} anúncios para sua busca, porém NENHUM possuía número de telefone, WhatsApp ou e-mail de contato direto com o vendedor. Em conformidade com o filtro de precisão estrita, esses anúncios foram ocultados para você não perder tempo com chat anônimo."
        else:
            diag["status"] = "strict_filter_depleted"
            diag["message"] = f"A OLX retornou {len(seen_ids)} anúncios, mas nenhum passou na sua régua estrita de filtros (Preço, Vendedor Novo ou Localidade)."
    elif len(all_ads) < len(seen_ids) and contact_filtered_out > 0:
        diag["status"] = "contacts_verified"
        diag["message"] = f"Exibindo {len(all_ads)} anúncio(s) com contatos diretos 100% verificados (WhatsApp/Telefone/Email). {contact_filtered_out} anúncio(s) sem contato direto foram descartados para máxima precisão."
    else:
        diag["status"] = "ok"
        diag["message"] = f"Puxada concluída com sucesso: {len(all_ads)} anúncio(s) validados com dados reais de contato."

    return all_ads, stats, diag

def calculate_price_stats(prices: list):
    """Calcula média, mediana, menor, maior e distribuição de preços."""
    if not prices:
        return {
            "count": 0,
            "average": 0.0,
            "median": 0.0,
            "min": 0.0,
            "max": 0.0,
            "std_dev": 0.0,
            "distribution": []
        }

    valid_prices = sorted([p for p in prices if p > 0])
    if not valid_prices:
        return {
            "count": 0,
            "average": 0.0,
            "median": 0.0,
            "min": 0.0,
            "max": 0.0,
            "std_dev": 0.0,
            "distribution": []
        }

    avg = round(sum(valid_prices) / len(valid_prices), 2)
    med = round(statistics.median(valid_prices), 2)
    min_p = round(min(valid_prices), 2)
    max_p = round(max(valid_prices), 2)
    std = round(statistics.stdev(valid_prices), 2) if len(valid_prices) > 1 else 0.0

    # Faixas de distribuição para os gráficos 3D
    step = (max_p - min_p) / 4 if max_p > min_p else 100
    b1 = round(min_p + step, 2)
    b2 = round(min_p + (step * 2), 2)
    b3 = round(min_p + (step * 3), 2)

    c1 = sum(1 for p in valid_prices if p <= b1)
    c2 = sum(1 for p in valid_prices if b1 < p <= b2)
    c3 = sum(1 for p in valid_prices if b2 < p <= b3)
    c4 = sum(1 for p in valid_prices if p > b3)

    distribution = [
        {"range": f"R$ {min_p:,.0f} - R$ {b1:,.0f}", "count": c1},
        {"range": f"R$ {b1:,.0f} - R$ {b2:,.0f}", "count": c2},
        {"range": f"R$ {b2:,.0f} - R$ {b3:,.0f}", "count": c3},
        {"range": f"> R$ {b3:,.0f}", "count": c4}
    ]

    return {
        "count": len(valid_prices),
        "average": avg,
        "median": med,
        "min": min_p,
        "max": max_p,
        "std_dev": std,
        "distribution": distribution
    }

def validate_single_ad(ad_url: str):
    """
    Scraper Validador de Anúncio Individual da OLX Brasil:
    - Extrai metadados completos Schema.org / Microdata
    - Extrai galeria de fotos em alta resolução
    - Analisa integridade, golpes conhecidos e calcula Score de Risco (0 - 100)
    """
    if not ad_url.startswith("http"):
        # Se for apenas o código, tenta montar
        ad_url = f"https://www.olx.com.br/anuncio-{ad_url}"

    html = fetch_olx_html(ad_url)
    soup = BeautifulSoup(html, "html.parser")

    # Verifica se o anúncio foi desativado/apagado pela OLX e redirecionou para a home
    page_title_tag = soup.find("title")
    page_title_text = page_title_tag.get_text(strip=True) if page_title_tag else ""
    is_home_redirect = "maior site de compra e venda" in page_title_text.lower() or "olx brasil" in page_title_text.lower() and not soup.find("h1")

    # Extrai dados estruturados JSON-LD
    product_data = None
    breadcrumbs = []
    for s in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(s.string)
            if isinstance(data, dict):
                if data.get("@type") == "Product":
                    product_data = data
                elif data.get("@type") == "BreadcrumbList":
                    items = data.get("itemListElement", [])
                    breadcrumbs = [it.get("item", {}).get("name", "") for it in items if isinstance(it, dict)]
        except Exception:
            continue

    if is_home_redirect and not product_data:
        raise ValueError("Este anúncio foi finalizado, vendido ou excluído pelo anunciante na OLX Brasil (a OLX redirecionou para a página inicial). Tente validar um anúncio ativo com o código numérico no final da URL.")

    # Título
    title = ""
    if product_data and product_data.get("name"):
        title = product_data.get("name")
    elif soup.find("h1"):
        title = soup.find("h1").get_text(strip=True)
    elif soup.title:
        title = soup.title.string.split("|")[0].strip()

    # Preço
    price_val = 0.0
    if product_data and product_data.get("offers"):
        offers = product_data.get("offers")
        price_val = float(offers.get("price", 0))
    if price_val == 0:
        p_tag = soup.find(lambda e: e.name in ["h2", "h3", "span"] and "R$" in e.text if e.text else False)
        if p_tag:
            price_val = parse_price(p_tag.get_text(strip=True))

    # Descrição Original e Estruturada do Anúncio
    description = ""
    if product_data and product_data.get("description"):
        description = clean_and_structure_olx_description(product_data.get("description"))
    else:
        desc_tag = soup.find("span", attrs={"data-qa": "ad-description"}) or soup.find("div", class_=lambda c: c and "description" in c)
        if desc_tag:
            description = clean_and_structure_olx_description(desc_tag.get_text(separator="\n", strip=True))

    # Imagens
    images = []
    if product_data and product_data.get("image"):
        img_entry = product_data.get("image")
        if isinstance(img_entry, list):
            for item in img_entry:
                if isinstance(item, dict) and item.get("contentUrl"):
                    images.append(item.get("contentUrl"))
                elif isinstance(item, str):
                    images.append(item)
        elif isinstance(img_entry, str):
            images.append(img_entry)

    if not images:
        # Fallback para tags de imagens no HTML
        for img in soup.find_all("img"):
            src = img.get("src") or img.get("data-src")
            if src and "img.olx.com.br" in src and src not in images:
                images.append(src)

    # Detalhes / Especificações
    specs = {}
    for dt in soup.find_all("dt"):
        dd = dt.find_next_sibling("dd")
        if dd:
            key = dt.get_text(strip=True).replace(":", "")
            specs[key] = dd.get_text(strip=True)

    # Localização
    location = "Brasil"
    loc_el = soup.find("span", attrs={"data-qa": "ad-location"}) or soup.find(lambda e: "CEP" in e.text or "Bairro" in e.text if e.text else False)
    if loc_el:
        location = loc_el.get_text(strip=True)

    # Análise de Risco & Segurança (Score de 0 a 100)
    risk_score = 15  # Base de risco baixa
    red_flags = []
    positive_flags = []

    desc_lower = description.lower()

    # Checagens de Risco
    if "sinal" in desc_lower or "segurar com sinal" in desc_lower or "metade antes" in desc_lower:
        risk_score += 40
        red_flags.append("Exige sinal/pagamento adiantado para segurar anúncio (Modo clássico de golpe)")

    if "uber flash" in desc_lower or "envio por uber" in desc_lower:
        risk_score += 30
        red_flags.append("Menção a envio via motorista de aplicativo/Uber Flash sem garantia presencial")

    if "comprovante" in desc_lower and ("envio" in desc_lower or "libero" in desc_lower):
        risk_score += 25
        red_flags.append("Exige envio mediante print de comprovante bancário")

    if "zap" in desc_lower or "whatsapp" in desc_lower or "chamar no whats" in desc_lower:
        risk_score += 20
        red_flags.append("Incentiva negociação estritamente fora do chat oficial da OLX")

    if len(images) <= 1:
        risk_score += 20
        red_flags.append("Apenas 1 foto cadastrada no anúncio (Pouca evidência visual)")
    elif len(images) >= 4:
        positive_flags.append(f"Galeria completa com {len(images)} fotos reais do produto")

    if len(description) < 40:
        risk_score += 15
        red_flags.append("Descrição muito curta ou vaga")
    else:
        positive_flags.append("Descrição detalhada com especificações")

    # Checagem de Garantia OLX
    if "garantia da olx" in html.lower() or "compra segura" in html.lower():
        risk_score = max(5, risk_score - 25)
        positive_flags.append("Anúncio conta com Proteção Garantia da OLX (Pagamento Seguro)")
    else:
        red_flags.append("Anúncio sem selo explícito de Garantia da OLX / OLX Pay")

    # Normaliza score entre 0 e 100
    risk_score = min(100, max(5, risk_score))

    if risk_score <= 25:
        verdict = "BAIXO RISCO - ANÚNCIO CONFIÁVEL"
        verdict_color = "green"
    elif risk_score <= 55:
        verdict = "RISCO MODERADO - PROSSIGA COM CAUTELA"
        verdict_color = "yellow"
    else:
        verdict = "ALTO RISCO - PROVÁVEL FRAUDE OU GOLPE"
        verdict_color = "red"

    # Extração Avançada do Perfil e Histórico do Vendedor OLX
    seller_info = {
        "name": "Anunciante OLX",
        "account_id": "",
        "city_state": location,
        "ddd": "",
        "verified_items": [],
        "completed_sales": "0",
        "cancelled_sales": "0",
        "is_pro": False,
        "rating": "5.0",
        "tempo_despacho": "",
        "user_since": ""
    }

    # 1. Extração via JSON estruturado adDetail (Next.js / SSR state da OLX)
    m_detail = re.search(r'"adDetail"\s*:\s*\{([^}]+)\}', html)
    if m_detail:
        detail_chunk = "{" + m_detail.group(1) + "}"
        m_sname = re.search(r'"sellerName"\s*:\s*"([^"]+)"', detail_chunk)
        if m_sname:
            seller_info["name"] = m_sname.group(1)
        m_acc = re.search(r'"sellerPublicAccountId"\s*:\s*"([^"]+)"', detail_chunk)
        if m_acc:
            seller_info["account_id"] = m_acc.group(1)
        m_ddd = re.search(r'"ddd"\s*:\s*"([^"]+)"', detail_chunk)
        if m_ddd:
            seller_info["ddd"] = m_ddd.group(1)
        m_pro = re.search(r'"professionalAd"\s*:\s*"([^"]*)"', detail_chunk)
        if m_pro and m_pro.group(1):
            seller_info["is_pro"] = True

    # 2. Verificações do perfil do vendedor (E-mail, Telefone, Facebook, etc.)
    found_tokens = []
    for v_item in soup.find_all(["div", "span", "li"], class_=lambda c: c and ("verified-item" in c.lower() or "verification" in c.lower()) if c else False):
        t = v_item.get_text(strip=True)
        if t:
            # Normaliza e divide caso venham colados como "E-mailTelefoneFacebook"
            for token in ["E-mail", "Telefone", "Facebook", "Identidade"]:
                if token.lower() in t.lower() and token not in found_tokens:
                    found_tokens.append(token)

    # Varredura por texto de verificações no corpo da página
    m_ver = re.search(r"Informaç[õo]es verificadas\s*([A-Za-z\s\-,•]+)", html, re.IGNORECASE)
    if m_ver:
        raw_v = m_ver.group(1).strip()
        for token in ["E-mail", "Telefone", "Facebook", "Identidade"]:
            if token.lower() in raw_v.lower() and token not in found_tokens:
                found_tokens.append(token)

    seller_info["verified_items"] = found_tokens

    # 3. Vendas concluídas e canceladas no histórico
    for hist_item in soup.find_all(["div", "span", "p"], class_=lambda c: c and ("advc-seller-history__item" in c or "seller" in c) if c else False):
        txt = hist_item.get_text(strip=True)
        if "conclu" in txt.lower():
            m_val = re.search(r"\d+", txt)
            if m_val:
                seller_info["completed_sales"] = m_val.group(0)
        elif "cancel" in txt.lower():
            m_val = re.search(r"\d+", txt)
            if m_val:
                seller_info["cancelled_sales"] = m_val.group(0)
        elif "tempo m" in txt.lower() or "despacho" in txt.lower():
            seller_info["tempo_despacho"] = txt

    # 4. Fallback no HTML caso o nome ainda seja padrão
    if seller_info["name"] in ["Anunciante OLX", "Vendedor", ""]:
        prof_title = (
            soup.find("div", class_=lambda c: c and "mini-profile__title" in c if c else False) or
            soup.find("span", class_=lambda c: c and "seller-name" in c if c else False) or
            soup.find("h2", class_=lambda c: c and "seller" in c if c else False)
        )
        if prof_title and prof_title.get_text(strip=True):
            candidate_name = prof_title.get_text(strip=True)
            if len(candidate_name) < 40 and not any(k in candidate_name.lower() for k in ["anúncio", "olx", "publicidade", "menu"]):
                seller_info["name"] = candidate_name

    # 5. Extração e Validação Avançada de Contato / WhatsApp Real
    contact = extract_phone_and_whatsapp(f"{title} {description} {html}", default_ddd=seller_info.get("ddd", ""))
    seller_info["contact"] = contact

    # Inteligência Neural de Lead & Síntese com Google Gemini IA
    lead_intel = analyze_lead_intelligence(
        ad={
            "title": title,
            "description": description,
            "price": price_val,
            "badges": [],
            "location": location,
            "seller_name": seller_info["name"],
            "ddd": seller_info.get("ddd", "")
        },
        market_stats={"average": price_val}
    )


    gemini_diagnosis = synthesize_with_gemini(
        ad_title=title,
        ad_desc=description,
        price=price_val,
        stats={"average": price_val}
    )

    return {
        "ad_url": ad_url,
        "title": title or "Anúncio Validado",
        "price": price_val,
        "price_formatted": f"R$ {price_val:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."),
        "description": description or "Sem descrição fornecida pelo anunciante.",
        "images": images,
        "specs": specs,
        "breadcrumbs": breadcrumbs,
        "location": location,
        "seller_info": seller_info,
        "risk_score": risk_score,
        "verdict": verdict,
        "verdict_color": verdict_color,
        "red_flags": red_flags,
        "positive_flags": positive_flags,
        "lead_intel": lead_intel,
        "gemini_diagnosis": gemini_diagnosis
    }
