import { Controller, Get, Header } from '@nestjs/common';
import { openApiDocument } from './openapi.document';

@Controller()
export class DocsController {
  @Get('docs')
  @Header('Content-Type', 'text/html; charset=utf-8')
  getSwaggerUi(): string {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Team Knowledge Base API — Swagger UI</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => SwaggerUIBundle({
      url: '/api/v1/openapi.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      persistAuthorization: false
    });
  </script>
</body>
</html>`;
  }

  @Get('openapi.json')
  getOpenApiDocument() {
    return openApiDocument;
  }
}
