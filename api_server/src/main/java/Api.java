import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

public class Api {
    static final JSONArray docs = new JSONArray("""
        [
            {"id": 1, "name": "Why AI Security Matters", "content": "As AI agents gain the ability to take real actions — sending emails, modifying files, calling APIs — the stakes of getting authorization wrong rise dramatically. Unlike a human who can pause and reflect, an AI agent executes instantly and at scale. A misconfigured permission can cascade into data leaks, unauthorized transactions, or irreversible deletions before anyone notices. AI security is not about slowing AI down; it is about making sure AI can move fast safely."},
            {"id": 2, "name": "The Principle of Least Privilege for AI Agents", "content": "Least privilege means granting an agent only the permissions it needs for the specific task at hand — nothing more. When a user asks an AI to read a document, the agent should not silently hold a token that also allows it to delete or share that document. Scoped, short-lived tokens enforced at the authorization server level are the foundation of safe agentic systems. Without this, every AI action carries the blast radius of the user's full permission set."},
            {"id": 3, "name": "Consent Fatigue and the UX Problem in AI Authorization", "content": "Traditional OAuth flows ask users to approve every permission scope before an agent can act. In practice, users click through consent screens without reading them — a behavior known as consent fatigue. The result is the worst of both worlds: users feel burdened, and security teams get meaningless approvals. The solution is to move authorization decisions upstream to enterprise policy, so the system enforces limits automatically and users never need to see a consent screen at all."},
            {"id": 4, "name": "Agentic AI and the Accountability Gap", "content": "When an AI agent causes harm — leaking sensitive data, deleting the wrong record, sending a message to the wrong audience — who is responsible? The agent cannot be held accountable. Responsibility falls on the user who delegated to it and the organization that deployed it. Closing this accountability gap requires a clear, auditable chain: which human authorized which agent, under which policy, to access which resource. Without that chain, post-incident investigation is nearly impossible."},
            {"id": 5, "name": "Enterprise-Grade AI Authorization: Key Requirements", "content": "A production-ready AI authorization system must satisfy four properties. (1) Delegated identity: the agent acts as the user, not as itself, so every action is traceable back to a human. (2) Centralized policy: organizations define what agents can and cannot do at the IdP or authorization server level, not per-user. (3) Narrow scopes: tokens are issued per-action with minimal permissions, not as long-lived broad grants. (4) Full auditability: every token exchange is logged with enough context to answer who authorized the AI, when, and to do exactly what."},
            {"id": 6, "name": "Hi, Tech Verse 2026!👋", "content": "Welcome to Tech Verse 2026! Today we're demonstrating how ID-JAG enables seamless delegation of human authority to AI agents — no consent screens, full enterprise control.\\n\\nTech Verse 2026へようこそ！ID-JAGがどのようにユーザーに負担をかけることなく、企業の統制を保ちながら人間の権限をAIエージェントへ安全に委譲するかをご紹介します。\\n\\nTech Verse 2026에 오신 것을 환영합니다! ID-JAG가 동의 화면 없이도 기업 통제를 유지하며 AI 에이전트에게 권한을 안전하게 위임하는 방법을 소개합니다."}
        ]
    """);

    static final int PORT = Integer.parseInt(System.getenv().getOrDefault("PORT", "14443"));
    static final String RESOURCE_NAME = "api:docs";

    static Authorizer authorizer;
    
    static int docIdSequence = 6;

    public static void main(String[] args) throws Exception {
        authorizer = new Authorizer();

        HttpServer server = HttpServer.create(new InetSocketAddress(PORT), 0);

        server.createContext("/api/docs", exchange -> {
            try {
                String method = exchange.getRequestMethod();
                String path = exchange.getRequestURI().getPath();
                String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
                
                System.out.println(String.format("[%s] [INFO] Request received: %s %s", timestamp, method, path));

                authorizer.authorizeRequest(exchange, RESOURCE_NAME);

                if ("GET".equalsIgnoreCase(method)) {
                    JSONArray activeDocs = new JSONArray();
                    for (int i = 0; i < docs.length(); i++) {
                        JSONObject doc = docs.getJSONObject(i);
                        if (!doc.optBoolean("isDeleted", false)) {
                            activeDocs.put(doc);
                        }
                    }
                    sendResponse(exchange, 200, new JSONObject().put("docs", activeDocs).toString());
                    
                } else if ("POST".equalsIgnoreCase(method)) {
                    InputStream is = exchange.getRequestBody();
                    JSONObject newDoc = new JSONObject(new String(is.readAllBytes(), StandardCharsets.UTF_8));

                    newDoc.put("id", ++docIdSequence);
                    
                    docs.put(newDoc);
                    sendResponse(exchange, 201, new JSONObject().put("success", true).put("doc", newDoc).toString());
                    
                } else if ("DELETE".equalsIgnoreCase(method)) {
                    try {
                        Integer targetId = parseDocumentId(exchange.getRequestURI().getRawPath());
                        if (targetId == null) {
                            sendResponse(exchange, 400, new JSONObject()
                                    .put("error", "Bad Request")
                                    .put("message", "Document ID is required in the path (e.g., /api/docs/{doc_id}).")
                                    .toString());
                            return;
                        }

                        boolean foundAndDeleted = false;
                        
                        for (int i = 0; i < docs.length(); i++) {
                            JSONObject doc = docs.getJSONObject(i);
                            if (doc.getInt("id") == targetId && !doc.optBoolean("isDeleted", false)) {
                                doc.put("isDeleted", true);
                                foundAndDeleted = true;
                                break;
                            }
                        }
                        
                        if (foundAndDeleted) {
                            sendResponse(exchange, 200, new JSONObject()
                                    .put("success", true)
                                    .put("message", "Document " + targetId + " deleted successfully.")
                                    .toString());
                        } else {
                            sendResponse(exchange, 404, new JSONObject()
                                    .put("error", "Not Found")
                                    .put("message", "Document with id " + targetId + " does not exist or is already deleted.")
                                    .toString());
                        }
                    } catch (NumberFormatException e) {
                        sendResponse(exchange, 400, new JSONObject()
                                .put("error", "Bad Request")
                                .put("message", "Invalid ID format. ID must be an integer.")
                                .toString());
                    }
                } else {
                    sendResponse(exchange, 405, "{\"error\": \"Method Not Allowed\"}");
                }

            } catch (IllegalArgumentException e) { // if 401
                System.err.printf("[%s] [WARN] Unauthorized request: %s%n", 
                        LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")), e.getMessage());
                        
                JSONObject err = new JSONObject()
                        .put("status", 401)
                        .put("error", "Unauthorized")
                        .put("message", e.getMessage());
                try {
                    sendResponse(exchange, 401, err.toString());
                } catch (Exception ex) {}

            } catch (SecurityException e) { // if 403
                System.err.printf("[%s] [WARN] Forbidden request (Athenz API Server with ZPE): %s%n",
                        LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")), e.getMessage());
                        
                JSONObject err = new JSONObject()
                        .put("status", 403)
                        .put("error", "Forbidden")
                        .put("message", "Access denied by Athenz API Server with ZPE.")
                        .put("details", e.getMessage());
                try {
                    sendResponse(exchange, 403, err.toString());
                } catch (Exception ex) {}

            } catch (Throwable e) { // if 500
                System.err.printf("[%s] [ERROR] Internal Server Error: %s%n", 
                        LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")), e.getMessage());
                e.printStackTrace();
                try {
                    sendResponse(exchange, 500, "{\"error\": \"Internal Server Error\"}");
                } catch (IOException ex) {}
            }
        });

        server.start();
        String jwkUri = System.getProperty("athenz.zpe.jwk_uri", "(not set)");
        System.out.println("\n=========================================================");
        System.out.println("🚀 API Server listening on http://0.0.0.0:" + PORT);
        System.out.println("🛡️  Athenz Required: " + authorizer.isRequired());
        if (authorizer.isRequired()) {
            System.out.println("🔑 Athenz ZTS JWK URI: " + jwkUri);
        }
        System.out.println("📄 Docs endpoint: http://0.0.0.0:" + PORT + "/api/docs");
        System.out.println("=========================================================\n");
    }

    private static Integer parseDocumentId(String rawPath) {
        String docsPath = "/api/docs";
        String docsPathWithSlash = docsPath + "/";

        if (rawPath.equals(docsPath) || rawPath.equals(docsPathWithSlash)) {
            return null;
        }

        if (!rawPath.startsWith(docsPathWithSlash)) {
            throw new NumberFormatException("Path must match /api/docs/{doc_id}");
        }

        String rawId = rawPath.substring(docsPathWithSlash.length());
        if (rawId.endsWith("/")) {
            rawId = rawId.substring(0, rawId.length() - 1);
        }

        if (rawId.isEmpty() || rawId.contains("/")) {
            throw new NumberFormatException("Document ID must be a single path segment");
        }

        String id = URLDecoder.decode(rawId, StandardCharsets.UTF_8);
        if (id.isEmpty() || !id.chars().allMatch(Character::isDigit)) {
            throw new NumberFormatException("Document ID must be an integer");
        }

        return Integer.parseInt(id);
    }

    private static void sendResponse(HttpExchange exchange, int code, String res) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        byte[] bytes = res.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(code, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }
}
