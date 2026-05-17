package com.example.mcpproxy;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.web.servlet.function.RouterFunction;
import org.springframework.web.servlet.function.ServerResponse;

import static org.springframework.cloud.gateway.server.mvc.handler.GatewayRouterFunctions.route;
import static org.springframework.cloud.gateway.server.mvc.handler.HandlerFunctions.http;
import static org.springframework.web.servlet.function.RequestPredicates.all;

@SpringBootApplication
public class McpProxyApplication {

    public static void main(String[] args) {
        SpringApplication.run(McpProxyApplication.class, args);
    }

    @Bean
    public RouterFunction<ServerResponse> proxyRoute(@Value("${mcp.target.url:http://localhost:8101}") String targetUrl) {
        return route("mcp-proxy-route")
                .route(all(), http(targetUrl))
                .build();
    }
}
