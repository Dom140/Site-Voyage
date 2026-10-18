const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public')); // Pour servir le frontend et les images

// Configuration de Multer pour le renommage unique des images uploadées
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/images/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const funcId = req.params.id || 'upload';
        cb(null, `func-${funcId}-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({ storage: storage });

// Configuration de la connexion à la base de données PostgreSQL
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

// Route pour uploader une image, la renommer et mettre à jour la BDD
app.post('/api/functions/:id/image', upload.single('image'), async (req, res) => {
    try {
        const functionId = req.params.id;
        
        if (!req.file) {
            return res.status(400).json({ error: 'Aucun fichier n\'a été envoyé.' });
        }

        const imageUrl = `/images/${req.file.filename}`;

        const query = `
            UPDATE trip_functions 
            SET image_url = $1 
            WHERE id = $2 
            RETURNING *;
        `;
        const values = [imageUrl, functionId];
        const result = await pool.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Fonction de voyage introuvable.' });
        }

        res.json({ 
            success: true, 
            message: 'Image uploadée et renommée avec succès.', 
            image_url: imageUrl,
            function: result.rows[0]
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erreur lors de l\'upload du fichier.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});