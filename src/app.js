const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const config = require('./config');
const apiRoutes = require('./routes');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');
const { HttpError } = require('./utils/httpError');

const app = express();

// Derrière le proxy HTTPS de Render/Railway : nécessaire pour req.ip et les cookies Secure.
if (config.isProduction) app.set('trust proxy', 1);

// En-têtes de sécurité HTTP (Content-Security-Policy, X-Frame-Options, HSTS...).
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],         // aucun script inline ni externe → limite fortement les XSS
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.isProduction ? [] : null,
      },
    },
  })
);

app.use(express.json({ limit: '20kb' }));
app.use(cookieParser());

// Défense CSRF complémentaire au cookie SameSite=Strict : toute requête qui modifie
// des données doit provenir de la même origine que le site.
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin && origin !== `${req.protocol}://${req.get('host')}`) {
    return next(new HttpError(403, 'Origine non autorisée'));
  }
  next();
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api', apiRoutes);
app.use('/api', notFoundHandler);

// Front-end statique servi par le même serveur : même origine → cookies SameSite=Strict OK.
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

app.use(errorHandler);

module.exports = app;
