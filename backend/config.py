import os

SCRAPERAPI_KEY = os.environ.get("SCRAPERAPI_KEY", "1aec3392b82784e4578154b96887e010")
SCRAPERAPI_URL = "https://api.scraperapi.com/"
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
ADMIN_SECRET_KEY = os.environ.get("ADMIN_SECRET_KEY", "10072601")

# Avatar Padrão Cyberpunk Vetorial (Lobo da Rede / Shogun)
DEFAULT_AVATAR_URI = "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20120%20120%22%3E%3Cdefs%3E%3CradialGradient%20id%3D%22g4%22%20cx%3D%2250%25%22%20cy%3D%2250%25%22%20r%3D%2250%25%22%3E%3Cstop%20offset%3D%220%25%22%20stop-color%3D%22%231e2430%22%2F%3E%3Cstop%20offset%3D%22100%25%22%20stop-color%3D%22%2306080d%22%2F%3E%3C%2FradialGradient%3E%3C%2Fdefs%3E%3Ccircle%20cx%3D%2260%22%20cy%3D%2260%22%20r%3D%2256%22%20fill%3D%22url(%23g4)%22%20stroke%3D%22%23ffffff%22%20stroke-width%3D%223%22%2F%3E%3Cpolygon%20points%3D%2260%2C20%2090%2C44%2082%2C82%2060%2C100%2038%2C82%2030%2C44%22%20fill%3D%22%23ffffff%22%2F%3E%3Cpolygon%20points%3D%2260%2C32%2078%2C50%2060%2C86%2042%2C50%22%20fill%3D%22%230c0e14%22%2F%3E%3Ccircle%20cx%3D%2252%22%20cy%3D%2252%22%20r%3D%223.8%22%20fill%3D%22%23ffffff%22%2F%3E%3Ccircle%20cx%3D%2268%22%20cy%3D%2252%22%20r%3D%223.8%22%20fill%3D%22%23ffffff%22%2F%3E%3C%2Fsvg%3E"


# Detecção de ambiente Vercel / Serverless (garante escrita em /tmp para não falhar por read-only filesystem)
if os.environ.get("VERCEL") == "1" or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
    DB_PATH = "/tmp/data.sqlite"
    # Se o banco base existir no repositório, copia para /tmp na primeira execução
    base_db = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data.sqlite")
    if os.path.exists(base_db) and not os.path.exists(DB_PATH):
        import shutil
        try:
            shutil.copyfile(base_db, DB_PATH)
        except Exception:
            pass
else:
    DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data.sqlite")

# Mapeamento completo dos 27 Estados Brasileiros (UFs) + Brasil Geral
BRAZILIAN_STATES = [
    {"uf": "BR", "name": "Todo o Brasil", "slug": "brasil"},
    {"uf": "SP", "name": "São Paulo", "slug": "estado-sp"},
    {"uf": "RJ", "name": "Rio de Janeiro", "slug": "estado-rj"},
    {"uf": "MG", "name": "Minas Gerais", "slug": "estado-mg"},
    {"uf": "RS", "name": "Rio Grande do Sul", "slug": "estado-rs"},
    {"uf": "PR", "name": "Paraná", "slug": "estado-pr"},
    {"uf": "SC", "name": "Santa Catarina", "slug": "estado-sc"},
    {"uf": "BA", "name": "Bahia", "slug": "estado-ba"},
    {"uf": "PE", "name": "Pernambuco", "slug": "estado-pe"},
    {"uf": "CE", "name": "Ceará", "slug": "estado-ce"},
    {"uf": "GO", "name": "Goiás", "slug": "estado-go"},
    {"uf": "DF", "name": "Distrito Federal", "slug": "estado-df"},
    {"uf": "ES", "name": "Espírito Santo", "slug": "estado-es"},
    {"uf": "MT", "name": "Mato Grosso", "slug": "estado-mt"},
    {"uf": "MS", "name": "Mato Grosso do Sul", "slug": "estado-ms"},
    {"uf": "PA", "name": "Pará", "slug": "estado-pa"},
    {"uf": "AM", "name": "Amazonas", "slug": "estado-am"},
    {"uf": "MA", "name": "Maranhão", "slug": "estado-ma"},
    {"uf": "RN", "name": "Rio Grande do Norte", "slug": "estado-rn"},
    {"uf": "PB", "name": "Paraíba", "slug": "estado-pb"},
    {"uf": "AL", "name": "Alagoas", "slug": "estado-al"},
    {"uf": "SE", "name": "Sergipe", "slug": "estado-se"},
    {"uf": "PI", "name": "Piauí", "slug": "estado-pi"},
    {"uf": "TO", "name": "Tocantins", "slug": "estado-to"},
    {"uf": "RO", "name": "Rondônia", "slug": "estado-ro"},
    {"uf": "AC", "name": "Acre", "slug": "estado-ac"},
    {"uf": "AP", "name": "Amapá", "slug": "estado-ap"},
    {"uf": "RR", "name": "Roraima", "slug": "estado-rr"}
]

# Categorias oficiais OLX Brasil
CATEGORIES = [
    {"id": "todas", "name": "Todas as Categorias", "path": ""},
    {"id": "autos-e-pecas", "name": "Autos e Peças", "path": "autos-e-pecas"},
    {"id": "carros", "name": "Carros, Vans e Utilitários", "path": "autos-e-pecas/carros-vans-e-utilitarios"},
    {"id": "motos", "name": "Motos", "path": "autos-e-pecas/motos"},
    {"id": "imoveis", "name": "Imóveis", "path": "imoveis"},
    {"id": "celulares", "name": "Celulares e Telefonia", "path": "eletronicos-e-celulares/celulares-e-telefonia"},
    {"id": "computadores", "name": "Computadores e Informática", "path": "eletronicos-e-celulares/computadores-e-acessorios"},
    {"id": "eletronicos", "name": "Eletrônicos, Áudio e Vídeo", "path": "eletronicos-e-celulares"},
    {"id": "casa", "name": "Para a sua Casa", "path": "para-a-sua-casa"},
    {"id": "moda", "name": "Moda e Beleza", "path": "moda-e-beleza"},
    {"id": "musica", "name": "Música e Hobbies", "path": "musica-e-hobbies"},
    {"id": "esportes", "name": "Esportes e Lazer", "path": "esportes-e-lazer"},
    {"id": "agro", "name": "Agro e Indústria", "path": "agro-e-industria"},
    {"id": "servicos", "name": "Serviços", "path": "servicos"}
]

# Cidades e Regiões Principais por UF
BRAZILIAN_CITIES = {
    "SP": [
        {"name": "Todas as Cidades de SP", "slug": ""},
        {"name": "São Paulo (Capital)", "slug": "sao-paulo-e-regiao/sao-paulo"},
        {"name": "Campinas e Região", "slug": "grande-campinas"},
        {"name": "Santos e Baixada Santista", "slug": "baixada-santista-e-litoral-sul"},
        {"name": "São José dos Campos e Vale", "slug": "vale-do-paraiba-e-litoral-norte"},
        {"name": "Ribeirão Preto e Região", "slug": "regiao-de-ribeirao-preto"},
        {"name": "Sorocaba e Região", "slug": "regiao-de-sorocaba"},
        {"name": "São José do Rio Preto", "slug": "regiao-de-sao-jose-do-rio-preto"},
        {"name": "Bauru e Região", "slug": "regiao-de-bauru-e-marilia"},
        {"name": "Presidente Prudente", "slug": "regiao-de-presidente-prudente"}
    ],
    "RJ": [
        {"name": "Todas as Cidades do RJ", "slug": ""},
        {"name": "Rio de Janeiro (Capital)", "slug": "rio-de-janeiro-e-regiao/rio-de-janeiro"},
        {"name": "Niterói e Região", "slug": "rio-de-janeiro-e-regiao/niteroi"},
        {"name": "Baixada Fluminense", "slug": "rio-de-janeiro-e-regiao/baixada-fluminense"},
        {"name": "Região dos Lagos (Cabo Frio/Búzios)", "slug": "norte-do-estado-do-rio/regiao-dos-lagos"},
        {"name": "Petrópolis e Região Serrana", "slug": "serra-angra-dos-reis-e-regiao"}
    ],
    "MG": [
        {"name": "Todas as Cidades de MG", "slug": ""},
        {"name": "Belo Horizonte (Capital)", "slug": "belo-horizonte-e-regiao/belo-horizonte"},
        {"name": "Uberlândia e Triângulo Mineiro", "slug": "triangulo-mineiro-e-alto-paranaiba"},
        {"name": "Juiz de Fora e Zona da Mata", "slug": "zona-da-mata"},
        {"name": "Montes Claros e Norte", "slug": "regiao-de-montes-claros-e-diamantina"}
    ],
    "PR": [
        {"name": "Todas as Cidades do PR", "slug": ""},
        {"name": "Curitiba e Região Metropolitana", "slug": "curitiba-e-regiao"},
        {"name": "Londrina e Região", "slug": "regiao-de-londrina"},
        {"name": "Maringá e Região", "slug": "regiao-de-maringa"},
        {"name": "Foz do Iguaçu e Oeste", "slug": "regiao-de-foz-do-iguacu-e-cascavel"}
    ],
    "RS": [
        {"name": "Todas as Cidades do RS", "slug": ""},
        {"name": "Porto Alegre e Região", "slug": "regioes-de-porto-alegre-torres-e-santa-cruz-do-sul"},
        {"name": "Caxias do Sul e Serra Gaúcha", "slug": "regioes-de-caxias-do-sul-e-passo-fundo"},
        {"name": "Pelotas e Litoral Sul", "slug": "regioes-de-pelotas-rio-grande-e-bage"}
    ],
    "SC": [
        {"name": "Todas as Cidades de SC", "slug": ""},
        {"name": "Florianópolis e Região", "slug": "florianopolis-e-regiao"},
        {"name": "Joinville e Norte", "slug": "norte-de-santa-catarina"},
        {"name": "Blumenau e Vale do Itajaí", "slug": "vale-do-itajai"},
        {"name": "Balneário Camboriú e Litoral", "slug": "florianopolis-e-regiao/balneario-camboriu"}
    ],
    "BA": [
        {"name": "Todas as Cidades da BA", "slug": ""},
        {"name": "Salvador e Região", "slug": "salvador"},
        {"name": "Feira de Santana", "slug": "regiao-de-feira-de-santana"},
        {"name": "Vitória da Conquista", "slug": "regiao-de-vitoria-da-conquista"}
    ],
    "DF": [
        {"name": "Distrito Federal (Brasília)", "slug": "distrito-federal-e-regiao"}
    ],
    "GO": [
        {"name": "Todas as Cidades de GO", "slug": ""},
        {"name": "Goiânia e Região", "slug": "grande-goiania-e-anapolis"},
        {"name": "Rio Verde e Sudoeste", "slug": "sul-de-goias"}
    ],
    "PE": [
        {"name": "Todas as Cidades de PE", "slug": ""},
        {"name": "Recife e Região Metropolitana", "slug": "grande-recife"},
        {"name": "Caruaru e Agreste", "slug": "regiao-de-petrolina-e-garanhuns"}
    ],
    "CE": [
        {"name": "Todas as Cidades do CE", "slug": ""},
        {"name": "Fortaleza e Região Metropolitana", "slug": "fortaleza-e-regiao"},
        {"name": "Juazeiro do Norte e Cariri", "slug": "regiao-de-juazeiro-do-norte-e-sobral"}
    ]
}

# Base de Inteligência Socioeconômica & Rendas de Bairros (Brasil)
NEIGHBORHOOD_SOCIO_DATA = {
    # São Paulo / Capital
    "moema": {"renda_media": "R$ 14.500 - R$ 26.000", "classe": "Classe A+", "seguranca": "Alta", "poder_compra": "Muito Alto", "perfil": "Região Nobre • Excelente para negociações presenciais e produtos premium"},
    "vila mariana": {"renda_media": "R$ 9.800 - R$ 18.000", "classe": "Classe A", "seguranca": "Alta", "poder_compra": "Alto", "perfil": "Bairro tradicional de classe média-alta • Ótima liquidez"},
    "pinheiros": {"renda_media": "R$ 12.000 - R$ 22.000", "classe": "Classe A+", "seguranca": "Alta", "poder_compra": "Muito Alto", "perfil": "Polo comercial e corporativo • Alto poder aquisitivo"},
    "perdizes": {"renda_media": "R$ 11.500 - R$ 20.000", "classe": "Classe A", "seguranca": "Alta", "poder_compra": "Alto", "perfil": "Zona Oeste nobre • Vendedores particulares qualificados"},
    "jardins": {"renda_media": "R$ 22.000 - R$ 45.000+", "classe": "Classe A++", "seguranca": "Muito Alta", "poder_compra": "Extremo", "perfil": "Área de altíssima renda • Vendas rápidas sem barganha extrema"},
    "morumbi": {"renda_media": "R$ 13.000 - R$ 28.000", "classe": "Classe A", "seguranca": "Média/Alta", "poder_compra": "Muito Alto", "perfil": "Condomínios fechados • Itens de alto valor agregado"},
    "itaim bibi": {"renda_media": "R$ 18.000 - R$ 35.000", "classe": "Classe A++", "seguranca": "Muito Alta", "poder_compra": "Extremo", "perfil": "Centro financeiro e tecnológico • Negociações ágeis"},
    "tatuapé": {"renda_media": "R$ 7.500 - R$ 14.000", "classe": "Classe B+/A", "seguranca": "Média/Alta", "poder_compra": "Alto", "perfil": "Polo forte da Zona Leste • Excelente fluxo de compradores"},
    "santana": {"renda_media": "R$ 6.200 - R$ 12.000", "classe": "Classe B+", "seguranca": "Média", "poder_compra": "Médio/Alto", "perfil": "Centro comercial da Zona Norte • Boa rotatividade"},
    "bela vista": {"renda_media": "R$ 5.500 - R$ 10.500", "classe": "Classe B", "seguranca": "Média", "poder_compra": "Médio", "perfil": "Região central universitária e hospitalar • Fácil acesso"},

    # Rio de Janeiro
    "copacabana": {"renda_media": "R$ 8.500 - R$ 16.000", "classe": "Classe A/B+", "seguranca": "Média", "poder_compra": "Alto", "perfil": "Zona Sul densa • Negociação fácil em locais públicos"},
    "ipanema": {"renda_media": "R$ 18.000 - R$ 38.000", "classe": "Classe A++", "seguranca": "Alta", "poder_compra": "Extremo", "perfil": "Zona Sul nobre • Vendedores exigentes e desapegos de luxo"},
    "leblon": {"renda_media": "R$ 22.000 - R$ 48.000+", "classe": "Classe A++", "seguranca": "Muito Alta", "poder_compra": "Extremo", "perfil": "Maior m² do Brasil • Compradores de altíssima renda"},
    "barra da tijuca": {"renda_media": "R$ 12.000 - R$ 25.000", "classe": "Classe A", "seguranca": "Alta", "poder_compra": "Muito Alto", "perfil": "Condomínios e shoppings • Preferência por retirada em shoppings"},
    "botafogo": {"renda_media": "R$ 9.000 - R$ 17.500", "classe": "Classe A", "seguranca": "Alta", "poder_compra": "Alto", "perfil": "Polo jovem e corporativo • Fácil logística e metrô"},
    "tijuca": {"renda_media": "R$ 5.800 - R$ 11.000", "classe": "Classe B+", "seguranca": "Média", "poder_compra": "Médio/Alto", "perfil": "Tradicional Zona Norte • Mercado consumidor sólido"},

    # Belo Horizonte
    "savassi": {"renda_media": "R$ 11.000 - R$ 22.000", "classe": "Classe A+", "seguranca": "Alta", "poder_compra": "Muito Alto", "perfil": "Zona Centro-Sul • Comércio e escritórios premium"},
    "lourdes": {"renda_media": "R$ 15.000 - R$ 32.000", "classe": "Classe A++", "seguranca": "Muito Alta", "poder_compra": "Extremo", "perfil": "Bairro nobre de BH • Produtos de alta gama"},
    "buritis": {"renda_media": "R$ 6.500 - R$ 13.000", "classe": "Classe B+", "seguranca": "Média/Alta", "poder_compra": "Médio/Alto", "perfil": "Bairro residencial universitário e famílias jovens"},

    # Curitiba
    "batel": {"renda_media": "R$ 14.000 - R$ 30.000", "classe": "Classe A+", "seguranca": "Muito Alta", "poder_compra": "Muito Alto", "perfil": "Bairro mais nobre de Curitiba • Negociações seguras"},
    "ecoville": {"renda_media": "R$ 16.000 - R$ 35.000", "classe": "Classe A++", "seguranca": "Muito Alta", "poder_compra": "Extremo", "perfil": "Edifícios de luxo • Desapegos de alto padrão"},
    "água verde": {"renda_media": "R$ 7.800 - R$ 15.000", "classe": "Classe A/B+", "seguranca": "Alta", "poder_compra": "Alto", "perfil": "Classe média tradicional e bem estruturada"},

    # Brasília (DF)
    "asa sul": {"renda_media": "R$ 15.000 - R$ 32.000", "classe": "Classe A+", "seguranca": "Alta", "poder_compra": "Extremo", "perfil": "Servidores federais e executivos • Alto poder de compra"},
    "asa norte": {"renda_media": "R$ 13.500 - R$ 28.000", "classe": "Classe A", "seguranca": "Alta", "poder_compra": "Muito Alto", "perfil": "Plano Piloto • Compradores qualificados e ágeis"},
    "lago sul": {"renda_media": "R$ 28.000 - R$ 60.000+", "classe": "Classe A++", "seguranca": "Muito Alta", "poder_compra": "Extremo", "perfil": "Maior renda per capita do país • Mansões e produtos de luxo"},
    "sudoeste": {"renda_media": "R$ 16.000 - R$ 34.000", "classe": "Classe A++", "seguranca": "Muito Alta", "poder_compra": "Extremo", "perfil": "Setor nobre de alta densidade e alto padrão"}
}

