import os
import re
import json
import logging
import requests
from typing import Dict, Any, List, Optional
from urllib.parse import quote

logger = logging.getLogger("ai_engine")

from .config import GEMINI_API_KEY as DEFAULT_GEMINI_KEY

# API Key Google Gemini (Vertex Express / AI Studio)
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or DEFAULT_GEMINI_KEY
GEMINI_MODELS = ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-flash-lite-latest", "gemini-3.8-flash"]

# Mapeamento de palavras por extenso para dígitos numéricos em português (desobfuscação de telefone)
WORD_TO_DIGIT = {
    "zero": "0", "um": "1", "humm": "1", "dois": "2", "tres": "3", "três": "3",
    "quatro": "4", "cinco": "5", "seis": "6", "meia": "6", "sete": "7",
    "oito": "8", "nove": "9", "dez": "10"
}

def deobfuscate_text_for_numbers(text: str) -> str:
    """
    Substitui termos camuflados e palavras numéricas por dígitos comuns
    para que o detector de telefones e WhatsApp encontre números disfarçados.
    Exemplo: 'onze nove oito sete...' -> '11 9 8 7...'
    """
    if not text:
        return ""
    
    clean = text.lower()
    
    # Substitui palavras de números por dígitos
    for word, digit in WORD_TO_DIGIT.items():
        clean = re.sub(rf"\b{word}\b", digit, clean)
    
    # Letras comuns usadas para disfarçar números (o -> 0, l/i -> 1)
    # Apenas quando cercadas de dígitos ou espaços suspeitos
    clean = re.sub(r"(?<=\d)[oO](?=\d)", "0", clean)
    clean = re.sub(r"(?<=\d)[lI](?=\d)", "1", clean)
    
    return clean

def extract_phone_and_whatsapp(text: str) -> Dict[str, Any]:
    """
    Extrai números de celular e WhatsApp do Brasil de textos com diversas técnicas de camuflagem:
    - Espaços entre dígitos (Ex: 1 1 9 8 8 7 7 6 6 5 5)
    - Pontuações (Ex: 11.98877.6655, 11-98877-6655)
    - Parênteses e códigos DDD
    - Palavras-chave como 'zap', 'whats', 'wpp', 'chamar no', 'tel', 'cel'
    """
    if not text:
        return {"has_phone": False, "phone_raw": "", "phone_formatted": "", "whatsapp_url": "", "is_whatsapp": False}
    
    prepared_text = deobfuscate_text_for_numbers(text)
    
    # Detecta se há menção a WhatsApp
    is_wpp_hint = bool(re.search(r"\b(zap|whats|whatsapp|wpp|wats|watsapp|chamar|msg|mensagem)\b", prepared_text, re.IGNORECASE))
    
    # Expressões regulares para números de telefone brasileiros com DDD (11 a 99)
    # Formato Celular moderno com 9: (XX) 9XXXX-XXXX
    # Padrão 1: Dígitos agrupados com possíveis separadores comuns
    regex_candidates = [
        # (XX) 9XXXX-XXXX ou XX 9XXXX XXXX
        r"(?:(?:\+|00)?55\s*)?(?:\(?([1-9][0-9])\)?\s*)?(9\s*[0-9]{4}[\s\.\-]?[0-9]{4})",
        # DDD explícito seguido de número corrido: 11987654321
        r"(?:(?:\+|00)?55\s*)?(?:\(?([1-9][0-9])\)?\s*)([0-9]{4,5}[\s\.\-]?[0-9]{4})",
        # Sequência espaçada de 9 ou 11 dígitos: 1 1 9 8 7 6 5 4 3 2 1
        r"(?:(?:1[1-9]|[2-9][0-9])\s*){1}(?:9\s*){1}(?:[0-9]\s*){8}"
    ]
    
    best_phone = ""
    best_ddd = ""
    
    for pattern in regex_candidates:
        matches = re.finditer(pattern, prepared_text)
        for m in matches:
            matched_str = m.group(0)
            digits_only = re.sub(r"[^\d]", "", matched_str)
            
            # Remove 55 se estiver no prefixo
            if digits_only.startswith("55") and len(digits_only) in [12, 13]:
                digits_only = digits_only[2:]
            
            # Verifica se tem tamanho válido de telefone brasileiro (10 dígitos fixo ou 11 celular)
            if len(digits_only) == 11 and digits_only[2] == "9":
                best_ddd = digits_only[:2]
                best_phone = digits_only
                break
            elif len(digits_only) == 10:
                best_ddd = digits_only[:2]
                best_phone = digits_only
                break
            elif len(digits_only) == 9 and digits_only.startswith("9"):
                # Sem DDD explícito
                best_phone = digits_only
        
        if best_phone and len(best_phone) >= 10:
            break

    # Se não achou com regex direta, busca blocos de dígitos compactados
    if not best_phone:
        raw_digits_stream = re.sub(r"[^\d]", "", prepared_text)
        # Procura sequências de 11 dígitos com DDD válido (11 a 99) e celular 9
        for i in range(len(raw_digits_stream) - 10):
            window = raw_digits_stream[i:i+11]
            ddd = window[:2]
            if 11 <= int(ddd) <= 99 and window[2] == "9":
                # Evita falsos positivos como CPF ou CEP
                best_phone = window
                best_ddd = ddd
                break

    if best_phone:
        if len(best_phone) == 11:
            formatted = f"({best_phone[:2]}) {best_phone[2:7]}-{best_phone[7:]}"
            full_wpp = f"55{best_phone}"
        elif len(best_phone) == 10:
            formatted = f"({best_phone[:2]}) {best_phone[2:6]}-{best_phone[6:]}"
            full_wpp = f"55{best_phone}"
        else:
            formatted = best_phone
            full_wpp = f"5511{best_phone}"
            
        whatsapp_url = f"https://wa.me/{full_wpp}?text={quote('Olá! Vi seu anúncio na OLX e tenho interesse em negociar.')}"
        
        return {
            "has_phone": True,
            "phone_raw": best_phone,
            "phone_formatted": formatted,
            "whatsapp_url": whatsapp_url,
            "is_whatsapp": is_wpp_hint or len(best_phone) == 11
        }
        
    return {
        "has_phone": False,
        "phone_raw": "",
        "phone_formatted": "",
        "whatsapp_url": "",
        "is_whatsapp": False
    }

def analyze_lead_intelligence(ad: Dict[str, Any], market_stats: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Motor Neural Autônomo de Inteligência de Leads e Validação de Anúncio:
    - Desobfuscação de contatos WhatsApp/Telefone
    - Temperatura do Lead (Quente, Oportunidade, Neutro, Risco)
    - Análise de Desespero de Venda e Margem para Desconto
    - Validação de Risco de Golpe e Autenticidade
    - Script de Abordagem Pronto para o Lead usar no WhatsApp
    """
    title = ad.get("title", "")
    description = ad.get("description", "")
    price = ad.get("price", 0.0)
    seller_name = ad.get("seller_name", "Vendedor")
    badges = ad.get("badges", [])
    location = ad.get("location", "Brasil")
    
    # Extração avançada de contato
    contact_info = extract_phone_and_whatsapp(description)
    
    desc_lower = description.lower()
    title_lower = title.lower()
    full_text = f"{title_lower} {desc_lower}"
    
    # 1. Indicadores de Urgência e Desespero de Venda (Lead Quente)
    urgency_keywords = [
        "preciso vender hoje", "motivo de viagem", "motivo de mudança", "mudança urgente",
        "preciso de grana", "aperto financeiro", "desapego urgente", "torrando",
        "preço pra sair hoje", "abaixei o preço", "faço desconto à vista",
        "aceito proposta", "proposta justa", "sem marcas de uso", "motivo da venda"
    ]
    
    urgency_score = 0
    detected_urgency_signals = []
    for kw in urgency_keywords:
        if kw in full_text:
            urgency_score += 20
            detected_urgency_signals.append(kw.capitalize())
            
    # 2. Avaliação de Preço vs Média Real de Mercado
    avg_price = market_stats.get("average", 0.0) if market_stats else 0.0
    price_deviation_pct = 0.0
    price_verdict = "Preço dentro da média de mercado"
    
    if avg_price > 0 and price > 0:
        price_deviation_pct = round(((price - avg_price) / avg_price) * 100, 1)
        if price_deviation_pct <= -45:
            price_verdict = f"Preço 🚨 {abs(price_deviation_pct)}% ABAIXO da média (Atenção redobrada a fraudes ou super desapego)"
        elif price_deviation_pct <= -15:
            price_verdict = f"Preço ⚡ {abs(price_deviation_pct)}% abaixo da média (Excelente oportunidade de revenda/compra)"
        elif price_deviation_pct >= 30:
            price_verdict = f"Preço 📈 {price_deviation_pct}% acima da média (Margem alta para pedir desconto agressivo)"
        else:
            price_verdict = f"Preço ⚖️ alinhado com a média de mercado (±{abs(price_deviation_pct)}%)"

    # 3. Análise Anti-Golpe e Fraudes
    risk_score = 10
    scam_signals = []
    trust_signals = []
    
    if "sinal" in desc_lower or "segurar mediante sinal" in desc_lower or "metade antes" in desc_lower:
        risk_score += 45
        scam_signals.append("Exige adiantamento/sinal para reservar o item")
        
    if "uber flash" in desc_lower or "envio por aplicativo" in desc_lower or "motoboy leva" in desc_lower:
        risk_score += 30
        scam_signals.append("Sugere envio por motorista de app sem intermediação segura")
        
    if "comprovante" in desc_lower and ("envio" in desc_lower or "libero" in desc_lower):
        risk_score += 25
        scam_signals.append("Menção a envio baseado em comprovante")
        
    if any("garantia da olx" in b.lower() or "olx pay" in b.lower() or "compra segura" in b.lower() for b in badges):
        risk_score = max(5, risk_score - 25)
        trust_signals.append("Conta com Proteção Garantia da OLX / Entrega Oficial")
        
    if "nota fiscal" in desc_lower or "com nota" in desc_lower or "nf-e" in desc_lower:
        trust_signals.append("Possui Nota Fiscal original comprovada")
        
    if "caixa original" in desc_lower or "acessórios originais" in desc_lower:
        trust_signals.append("Produto completo na caixa com acessórios originais")
        
    if "retirada em mãos" in desc_lower or "retirar no local" in desc_lower or "testa na hora" in desc_lower:
        trust_signals.append("Permite teste presencial e retirada em local físico")

    # 4. Cálculo da Temperatura do Lead (0 a 100)
    lead_score = 50
    if contact_info["has_phone"]:
        lead_score += 20  # Contato direto aumenta muito a chance de fechar
    if urgency_score > 0:
        lead_score += min(25, urgency_score)
    if -35 <= price_deviation_pct <= -10:
        lead_score += 15  # Preço bom sem parecer golpe
    if trust_signals:
        lead_score += min(15, len(trust_signals) * 5)
    if risk_score > 40:
        lead_score -= 30
        
    lead_score = max(5, min(99, lead_score))
    
    # Classificação
    if lead_score >= 80:
        lead_category = "LEAD QUENTE 🔥"
        lead_badge_class = "lead-hot"
    elif lead_score >= 60:
        lead_category = "OPORTUNIDADE ⚡"
        lead_badge_class = "lead-opportunity"
    elif lead_score >= 40:
        lead_category = "PROSPECTO REGULAR 📌"
        lead_badge_class = "lead-regular"
    else:
        lead_category = "RISCO / CAUTELA ⚠️"
        lead_badge_class = "lead-risk"

    # 5. Geração de Script de Negociação Inteligente
    first_name = seller_name.split()[0] if seller_name else "Vendedor"
    suggested_offer = round(price * 0.88, 2) if price > 0 else 0
    suggested_offer_fmt = f"R$ {suggested_offer:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    
    negotiation_script = (
        f"Olá {first_name}! Tudo bem? Vi seu anúncio '{title}' na OLX. "
        f"Tenho real interesse e posso fechar o pagamento à vista no Pix hoje mesmo. "
        f"Consegue fazer por {suggested_offer_fmt} para fecharmos agora? "
        f"Posso retirar com você em mãos ou combinamos o envio seguro."
    )
    
    tactical_tip = (
        "Vendedor com perfil particular e contato direto. "
        "Ofereça pagamento imediato via Pix para barganhar entre 10% e 15% de desconto. "
        "Sempre priorize entrega com teste presencial em local público ou Garantia OLX."
    )
    if urgency_score > 0:
        tactical_tip = (
            "VENDEDOR COM SINAL DE URGÊNCIA DETECTADO! "
            "Ele demonstrou necessidade de venda rápida. Você tem forte alavancagem para negociar "
            "um desconto ainda maior à vista."
        )

    return {
        "lead_score": lead_score,
        "lead_category": lead_category,
        "lead_badge_class": lead_badge_class,
        "contact": contact_info,
        "urgency_signals": detected_urgency_signals,
        "trust_signals": trust_signals,
        "scam_signals": scam_signals,
        "risk_score": risk_score,
        "price_verdict": price_verdict,
        "price_deviation_pct": price_deviation_pct,
        "negotiation_script": negotiation_script,
        "tactical_tip": tactical_tip
    }

def synthesize_with_gemini(ad_title: str, ad_desc: str, price: float, stats: Optional[Dict[str, Any]] = None) -> Optional[str]:
    """
    Consulta o Google Gemini caso a chave esteja presente,
    gerando um resumo executivo com IA generativa para enriquecer a inteligência do lead.
    Possui failover automático entre modelos caso ocorra lentidão ou pico de demanda.
    """
    if not GEMINI_API_KEY:
        return None
        
    avg_price = stats.get("average", 0.0) if stats else 0.0
    prompt = (
        f"Você é um analista sênior de inteligência de mercado e aquisições do sistema OLX Brasil.\n"
        f"Analise o anúncio abaixo e gere em 2 parágrafos objetivos:\n"
        f"1. Diagnóstico do preço vs mercado (Preço do anúncio: R$ {price:,.2f}, Média de referência: R$ {avg_price:,.2f}).\n"
        f"2. Estratégia de abordagem psicológica com o vendedor para fechar o negócio com lucro e segurança máxima (com sugestão de oferta e pagamento via Pix à vista).\n\n"
        f"Título: {ad_title}\n"
        f"Descrição: {ad_desc[:1200]}\n"
    )
    
    payload = {
        "contents": [{
            "parts": [{"text": prompt}]
        }],
        "generationConfig": {
            "temperature": 0.4,
            "maxOutputTokens": 450
        }
    }

    for model in GEMINI_MODELS:
        try:
            endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GEMINI_API_KEY}"
            res = requests.post(endpoint, json=payload, headers={"Content-Type": "application/json"}, timeout=12)
            if res.status_code == 200:
                data = res.json()
                candidates = data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts:
                        text = parts[0].get("text", "").strip()
                        if text:
                            return text
            elif res.status_code in [503, 500, 429]:
                logger.info(f"Modelo {model} ocupado (status {res.status_code}), alternando para próximo...")
                continue
            else:
                logger.warning(f"Erro no modelo {model}: status {res.status_code} - {res.text[:120]}")
        except Exception as e:
            logger.warning(f"Exceção ao consultar modelo {model}: {e}")
            continue
        
    return None
