const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public')); // Pour servir le frontend

// Configuration de la connexion à la base de données PostgreSQL (à adapter selon vos variables d'environnement)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/carnet_voyage'
});

// Route de recherche publique avec filtres (mode visualisation)
app.get('/api/trips/search', async (req, res) => {
    try {
        const { transport, origin, destination, min_duration, max_duration } = req.query;
        
        let query = `
            SELECT DISTINCT t.*, 
            (t.end_date - t.start_date + 1) AS duration_days
            FROM trips t
            LEFT JOIN trip_days td ON t.id = td.trip_id
            LEFT JOIN trip_functions tf ON td.id = tf.day_id
            WHERE 1=1
        `;
        let values = [];
        let index = 1;

        if (transport) {
            query += ` AND tf.transport_type = $${index++}`;
            values.push(transport);
        }
        if (origin) {
            query += ` AND t.country_origin ILIKE $${index++}`;
            values.push(`%${origin}%`);
        }
        if (destination) {
            query += ` AND t.country_destination ILIKE $${index++}`;
            values.push(`%${destination}%`);
        }
        if (min_duration) {
            query += ` AND (t.end_date - t.start_date + 1) >= $${index++}`;
            values.push(parseInt(min_duration));
        }
        if (max_duration) {
            query += ` AND (t.end_date - t.start_date + 1) <= $${index++}`;
            values.push(parseInt(max_duration));
        }

        const result = await pool.query(query, values);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erreur serveur lors de la recherche" });
    }
});

// Route pour récupérer le détail complet d'un séjour (Jours + Fonctions + Coûts)
app.get('/api/trips/:id', async (req, res) => {
    try {
        const tripId = req.params.id;
        const tripResult = await pool.query('SELECT * FROM trips WHERE id = $1', [tripId]);
        if (tripResult.rows.length === 0) return res.status(404).json({ error: "Séjour non trouvé" });

        const daysResult = await pool.query('SELECT * FROM trip_days WHERE trip_id = $1 ORDER BY day_number', [tripId]);
        
        let days = [];
        for (let day of daysResult.rows) {
            const funcResult = await pool.query('SELECT * FROM trip_functions WHERE day_id = $1 ORDER BY position_order', [day.id]);
            days.push({ ...day, functions: funcResult.rows });
        }

        res.json({ trip: tripResult.rows[0], days });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erreur lors de la récupération du séjour" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});