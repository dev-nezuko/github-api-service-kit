"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const routes_1 = __importDefault(require("./routes"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const yamljs_1 = __importDefault(require("yamljs"));
const path_1 = __importDefault(require("path"));
const swaggerDocument = yamljs_1.default.load(path_1.default.join(__dirname, '../docs/api-spec.yaml'));
const app = (0, express_1.default)();
const base = process.env.API_VERSION || '/api/v1';
app.use(`${base}/repo/stats`, routes_1.default);
app.use(`${base}/api-docs`, swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swaggerDocument));
app.use((_err, _req, res, _next) => {
    res.status(502).json({ error: 'Unable to retrieve GitHub pull requests. Try again later.' });
});
if (require.main === module) {
    const port = Number(process.env.PORT || 3000);
    app.listen(port, '127.0.0.1', () => console.log(`Server listening on port ${port}`));
}
exports.default = app;
//# sourceMappingURL=app.js.map