export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Team Knowledge Base API',
    description: 'REST API for authentication, workspaces, memberships, Markdown documents, and health checks.',
    version: '1.0.0',
  },
  servers: [{ url: '/api/v1', description: 'Current API' }],
  tags: [
    { name: 'Authentication' },
    { name: 'Workspaces' },
    { name: 'Memberships' },
    { name: 'Documents' },
    { name: 'Health' },
  ],
  components: {
    securitySchemes: {
      sessionCookie: { type: 'apiKey', in: 'cookie', name: 'sessionToken' },
    },
    schemas: {
      RegisterInput: {
        type: 'object', required: ['email', 'password'],
        properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 8 } },
      },
      LoginInput: {
        type: 'object', required: ['email', 'password'],
        properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } },
      },
      CreateWorkspaceInput: {
        type: 'object', required: ['name'],
        properties: { name: { type: 'string', minLength: 1, maxLength: 120 } },
      },
      AddMemberInput: {
        type: 'object', required: ['email'],
        properties: { email: { type: 'string', format: 'email' } },
      },
      UpdateMemberRoleInput: {
        type: 'object', required: ['role'],
        properties: { role: { type: 'string', enum: ['member', 'viewer'] } },
      },
      CreateDocumentInput: {
        type: 'object', required: ['title'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
          contentMarkdown: { type: 'string', maxLength: 100000, default: '' },
        },
      },
      UpdateDocumentInput: {
        type: 'object', minProperties: 1,
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
          contentMarkdown: { type: 'string', maxLength: 100000 },
        },
      },
    },
  },
  paths: {
    '/auth/register': { post: { tags: ['Authentication'], summary: 'Register an account', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterInput' } } } }, responses: { '201': { description: 'Account created' }, '400': { description: 'Invalid input' }, '409': { description: 'Email already registered' } } } },
    '/auth/login': { post: { tags: ['Authentication'], summary: 'Create a session; sets the sessionToken cookie', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginInput' } } } }, responses: { '200': { description: 'Authenticated; session cookie set' }, '401': { description: 'Invalid credentials' } } } },
    '/auth/logout': { post: { tags: ['Authentication'], summary: 'Revoke current session', responses: { '204': { description: 'Session revoked and cookie cleared' } } } },
    '/auth/me': { get: { tags: ['Authentication'], summary: 'Get current user', security: [{ sessionCookie: [] }], responses: { '200': { description: 'Current user' }, '401': { description: 'Unauthenticated' } } } },
    '/workspaces': {
      get: { tags: ['Workspaces'], summary: 'List workspaces for current user', security: [{ sessionCookie: [] }], responses: { '200': { description: 'Workspace list' }, '401': { description: 'Unauthenticated' } } },
      post: { tags: ['Workspaces'], summary: 'Create a workspace', security: [{ sessionCookie: [] }], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateWorkspaceInput' } } } }, responses: { '201': { description: 'Workspace created' }, '400': { description: 'Invalid input' } } },
    },
    '/workspaces/{workspaceId}': { get: { tags: ['Workspaces'], summary: 'Get a workspace the current user belongs to', security: [{ sessionCookie: [] }], parameters: [{ name: 'workspaceId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '200': { description: 'Workspace' }, '404': { description: 'Workspace not found or inaccessible' } } } },
    '/workspaces/{workspaceId}/members': {
      get: { tags: ['Memberships'], summary: 'List workspace members', security: [{ sessionCookie: [] }], parameters: [{ name: 'workspaceId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '200': { description: 'Members list' }, '403': { description: 'Not a workspace member' } } },
      post: { tags: ['Memberships'], summary: 'Add an existing registered user by email (Owner only)', security: [{ sessionCookie: [] }], parameters: [{ name: 'workspaceId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AddMemberInput' } } } }, responses: { '201': { description: 'Member added' }, '403': { description: 'Owner role required' }, '404': { description: 'User not found' }, '409': { description: 'Already a member' } } },
    },
    '/workspaces/{workspaceId}/members/{userId}': {
      patch: { tags: ['Memberships'], summary: 'Update member role (Owner only; cannot change Owner)', security: [{ sessionCookie: [] }], parameters: [{ name: 'workspaceId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }, { name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateMemberRoleInput' } } } }, responses: { '200': { description: 'Role updated' }, '403': { description: 'Owner role required' }, '404': { description: 'Member not found' } } },
      delete: { tags: ['Memberships'], summary: 'Remove member (Owner only; cannot remove Owner)', security: [{ sessionCookie: [] }], parameters: [{ name: 'workspaceId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }, { name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '200': { description: 'Member removed' }, '403': { description: 'Owner role required' }, '404': { description: 'Member not found' } } },
    },
    '/workspaces/{workspaceId}/documents': {
      get: {
        tags: ['Documents'], summary: 'List workspace documents with search, sorting, and pagination',
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: 'workspaceId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'q', in: 'query', schema: { type: 'string', maxLength: 200 } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['title', 'createdAt', 'updatedAt'], default: 'updatedAt' } },
          { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' } },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: { '200': { description: 'Documents and pagination metadata' }, '401': { description: 'Unauthenticated' }, '404': { description: 'Workspace not found or inaccessible' }, '400': { description: 'Invalid query parameters' } },
      },
      post: {
        tags: ['Documents'], summary: 'Create a Markdown document (Owner or Member)',
        security: [{ sessionCookie: [] }],
        parameters: [{ name: 'workspaceId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateDocumentInput' } } } },
        responses: { '201': { description: 'Document created' }, '400': { description: 'Invalid input' }, '403': { description: 'Viewer cannot create documents' }, '404': { description: 'Workspace not found or inaccessible' } },
      },
    },
    '/workspaces/{workspaceId}/documents/{documentId}': {
      get: {
        tags: ['Documents'], summary: 'Get a document in a workspace',
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: 'workspaceId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'documentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { '200': { description: 'Document' }, '401': { description: 'Unauthenticated' }, '404': { description: 'Document or workspace not found' } },
      },
      patch: {
        tags: ['Documents'], summary: 'Update a Markdown document (Owner or Member)',
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: 'workspaceId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'documentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateDocumentInput' } } } },
        responses: { '200': { description: 'Document updated' }, '400': { description: 'Invalid or empty update' }, '403': { description: 'Viewer cannot update documents' }, '404': { description: 'Document or workspace not found' } },
      },
      delete: {
        tags: ['Documents'], summary: 'Delete a Markdown document (Owner or Member)',
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: 'workspaceId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'documentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { '200': { description: 'Document deleted' }, '403': { description: 'Viewer cannot delete documents' }, '404': { description: 'Document or workspace not found' } },
      },
    },
    '/health': { get: { tags: ['Health'], summary: 'Liveness check', responses: { '200': { description: 'API process is running' } } } },
    '/health/ready': { get: { tags: ['Health'], summary: 'Readiness check including PostgreSQL connectivity', responses: { '200': { description: 'API and database are ready' }, '503': { description: 'Database unavailable' } } } },
  },
} as const;
