// Données de démonstration (comptes, prestations, créneaux, rendez-vous).
// Mot de passe de TOUS les comptes de démo : Demo1234
const bcrypt = require('bcrypt');
const { pool, withTransaction } = require('../src/db/pool');

const PASSWORD = 'Demo1234';

function at(daysFromNow, hour, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d;
}

(async () => {
  const hash = await bcrypt.hash(PASSWORD, 10);

  await withTransaction(async (db) => {
    const tradeId = async (name) =>
      (await db.query('SELECT id FROM trades WHERE name = $1', [name])).rows[0].id;

    const user = async (email, first, last, role, phone = null) =>
      (await db.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, phone, role)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [email, hash, first, last, phone, role]
      )).rows[0].id;

    const artisan = async (email, first, last, business, trade, city, description, verified) => {
      const id = await user(email, first, last, 'artisan', '06 12 34 56 78');
      await db.query(
        `INSERT INTO artisan_profiles (user_id, business_name, trade_id, city, description, is_verified, verified_at)
         VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $6 THEN NOW() END)`,
        [id, business, await tradeId(trade), city, description, verified]
      );
      return id;
    };

    const service = async (artisanId, title, description, priceCents, duration) =>
      (await db.query(
        `INSERT INTO services (artisan_id, title, description, price_cents, duration_minutes)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [artisanId, title, description, priceCents, duration]
      )).rows[0].id;

    const slot = async (artisanId, start, minutes = 60) =>
      (await db.query(
        'INSERT INTO slots (artisan_id, starts_at, ends_at) VALUES ($1, $2, $3) RETURNING id',
        [artisanId, start, new Date(start.getTime() + minutes * 60_000)]
      )).rows[0].id;

    const appointment = async (clientId, serviceId, slotId, address, description, statuses) => {
      const id = (await db.query(
        `INSERT INTO appointments (client_id, artisan_id, service_id, slot_id, price_cents, address, description, status)
         SELECT $1, s.artisan_id, s.id, $3, s.price_cents, $4, $5, $6 FROM services s WHERE s.id = $2
         RETURNING id`,
        [clientId, serviceId, slotId, address, description, statuses[statuses.length - 1]]
      )).rows[0].id;
      let from = null;
      for (const to of statuses) {
        await db.query(
          `INSERT INTO appointment_status_history (appointment_id, from_status, to_status, changed_by)
           VALUES ($1, $2, $3, $4)`,
          [id, from, to, clientId]
        );
        from = to;
      }
    };

    // --- Comptes ---
    await user('admin@craftflow.fr', 'Alice', 'Martin', 'admin');
    const client1 = await user('client@craftflow.fr', 'Camille', 'Durand', 'client', '07 11 22 33 44');
    const client2 = await user('julien@craftflow.fr', 'Julien', 'Petit', 'client');

    const plombier = await artisan(
      'plombier@craftflow.fr', 'Marc', 'Lefèvre', 'Lefèvre Plomberie', 'Plomberie', 'Paris',
      'Plombier depuis 15 ans, intervention rapide sur Paris et proche banlieue.', true
    );
    const elec = await artisan(
      'electricien@craftflow.fr', 'Sofiane', 'Benali', 'Benali Électricité', 'Électricité', 'Lyon',
      'Électricien certifié Qualifelec. Mise aux normes, dépannage, installation.', true
    );
    await artisan(
      'serrurier@craftflow.fr', 'Nadia', 'Roux', 'Roux Serrurerie', 'Serrurerie', 'Marseille',
      'Ouverture de porte, changement de serrure, blindage.', false // en attente de validation admin
    );

    // --- Prestations ---
    const fuite = await service(plombier, 'Réparation de fuite', 'Recherche et réparation de fuite visible (robinet, siphon, raccord).', 8900, 60);
    const wc = await service(plombier, 'Débouchage WC / évier', 'Débouchage manuel ou mécanique.', 11000, 60);
    await service(plombier, 'Remplacement chauffe-eau', 'Dépose et pose d\'un chauffe-eau électrique jusqu\'à 200 L (hors fourniture).', 35000, 180);
    const panne = await service(elec, 'Dépannage panne électrique', 'Diagnostic et remise en service (disjoncteur, court-circuit).', 9500, 60);
    await service(elec, 'Installation prise / interrupteur', 'Pose ou remplacement d\'une prise ou d\'un interrupteur.', 6000, 30);
    await service(elec, 'Mise aux normes tableau électrique', 'Remplacement du tableau et mise en conformité NF C 15-100.', 90000, 240);

    // --- Créneaux (jours ouvrés à venir) ---
    const plombierSlots = [];
    const elecSlots = [];
    for (let day = 1; day <= 7; day++) {
      for (const hour of [8, 10, 14, 16]) {
        plombierSlots.push(await slot(plombier, at(day, hour), 90));
        elecSlots.push(await slot(elec, at(day, hour, 30), 60));
      }
    }

    // Créneaux passés pour l'historique
    const pastPlombier = await slot(plombier, at(-3, 10), 90);
    const pastElec = await slot(elec, at(-5, 14), 60);

    // --- Rendez-vous de démonstration ---
    await appointment(client1, fuite, plombierSlots[0], '12 rue de Rivoli, 75004 Paris',
      'Fuite sous l\'évier de la cuisine, ça goutte en continu.', ['EN_ATTENTE']);
    await appointment(client1, panne, elecSlots[2], '8 quai Saint-Antoine, 69002 Lyon',
      'Le disjoncteur saute dès que j\'allume le four.', ['EN_ATTENTE', 'CONFIRME']);
    await appointment(client2, wc, pastPlombier, '45 avenue de Clichy, 75017 Paris',
      'WC bouché, la chasse d\'eau déborde.', ['EN_ATTENTE', 'CONFIRME', 'TERMINE']);
    await appointment(client2, panne, pastElec, '3 rue Mercière, 69002 Lyon',
      'Plus de courant dans la chambre.', ['EN_ATTENTE', 'ANNULE']);
    await appointment(client2, wc, plombierSlots[5], '45 avenue de Clichy, 75017 Paris',
      'Évier de la salle de bain qui se vide très lentement.', ['EN_ATTENTE']);
  });

  console.log('Données de démo insérées. Mot de passe de tous les comptes :', PASSWORD);
  await pool.end();
})().catch(async (err) => {
  console.error('Échec du seed :', err.message);
  await pool.end();
  process.exit(1);
});
