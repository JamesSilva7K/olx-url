import os

SCRAPERAPI_KEY = os.environ.get("SCRAPERAPI_KEY", "1aec3392b82784e4578154b96887e010")
SCRAPERAPI_URL = "https://api.scraperapi.com/"
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
ADMIN_SECRET_KEY = os.environ.get("ADMIN_SECRET_KEY", "10072601")

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
