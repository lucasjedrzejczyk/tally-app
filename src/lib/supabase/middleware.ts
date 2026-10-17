// Renovação de sessão + guarda de rota no middleware (roda em toda navegação).
// Padrão @supabase/ssr: revalida os cookies da sessão e redireciona quem não
// está autenticado para /login. A autorização fina (org/permissão) é feita nas
// próprias páginas/actions no servidor — aqui é só o portão de autenticação.
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env";
import { studyOnlyRedirect } from "@/config/nav";

// Rotas públicas (sem sessão): login e callbacks de auth.
// O manifesto, o service worker e a página offline precisam abrir sem sessão: o navegador
// busca o manifesto sem cookie, e a página offline é guardada para quando não há rede.
const PUBLIC_PREFIXES = ["/login", "/auth", "/esqueci-senha", "/redefinir-senha", "/site", "/pt", "/termos", "/privacidade", "/tour", "/pedido", "/formulario", "/manifest.webmanifest", "/sw.js", "/offline.html"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() revalida o token no servidor (não confia só no cookie local).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Sem sessão, a raiz mostra a página pública do produto (URL continua "/").
  if (!user && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/site";
    return NextResponse.rewrite(url);
  }

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  const studyOnly = user ? studyOnlyRedirect(pathname) : null;
  if (studyOnly) {
    const url = request.nextUrl.clone();
    url.pathname = studyOnly;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
