const express = require('express');
const h = require('../utils/asyncHandler');
const rateLimit = require('../middlewares/rateLimit');
const { authenticate, requireRole } = require('../middlewares/auth');

const auth = require('../controllers/authController');
const services = require('../controllers/serviceController');
const slots = require('../controllers/slotController');
const appointments = require('../controllers/appointmentController');
const artisan = require('../controllers/artisanController');
const admin = require('../controllers/adminController');

const router = express.Router();
const authLimiter = rateLimit({ windowMs: 15 * 60_000, max: process.env.NODE_ENV === 'test' ? 1000 : 20 });

const isClient = [authenticate, requireRole('client')];
const isArtisan = [authenticate, requireRole('artisan')];
const isAdmin = [authenticate, requireRole('admin')];

// ---------- Authentification ----------
router.post('/auth/register', authLimiter, h(auth.register));
router.post('/auth/login', authLimiter, h(auth.login));
router.post('/auth/logout', auth.logout);
router.get('/auth/me', authenticate, h(auth.me));

// ---------- Catalogue public ----------
router.get('/trades', h(services.listTrades));
router.get('/services', h(services.listPublic));
router.get('/services/mine', isArtisan, h(services.listMine)); // avant /:id
router.get('/services/:id', h(services.getPublic));
router.get('/services/:id/slots', h(services.listAvailableSlots));

// ---------- Espace artisan ----------
router.post('/services', isArtisan, h(services.create));
router.put('/services/:id', isArtisan, h(services.update));
router.delete('/services/:id', isArtisan, h(services.deactivate));

router.get('/slots', isArtisan, h(slots.listMine));
router.post('/slots', isArtisan, h(slots.createBatch));
router.delete('/slots/:id', isArtisan, h(slots.remove));

router.get('/artisan/profile', isArtisan, h(artisan.getProfile));
router.put('/artisan/profile', isArtisan, h(artisan.updateProfile));

// ---------- Rendez-vous (périmètre selon le rôle) ----------
router.get('/appointments', authenticate, h(appointments.list));
router.get('/appointments/:id', authenticate, h(appointments.getOne));
router.post('/appointments', isClient, h(appointments.create));
router.patch('/appointments/:id/status', authenticate, h(appointments.changeStatus));

// ---------- Administration ----------
router.get('/admin/stats', isAdmin, h(admin.stats));
router.get('/admin/users', isAdmin, h(admin.listUsers));
router.patch('/admin/users/:id/active', isAdmin, h(admin.setUserActive));
router.patch('/admin/artisans/:id/verify', isAdmin, h(admin.verifyArtisan));

module.exports = router;
