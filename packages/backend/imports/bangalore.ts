// User-supplied notes. Missing scores and dates are intentionally not invented.
// Tuple order: dish/category, Mansi, Nishit, shared note, Mansi note, Nishit note.
type Item = [string, number | null, number | null, string?, string?, string?];
type Place = {
  title: string;
  area?: string;
  visitNumber?: number;
  notes?: string;
  dishes?: Item[];
  categories?: Item[];
  location?: { latitude: number; longitude: number; source: string };
  mapQuery?: string;
};
export const bangaloreNotes: Place[] = [
  {
    title: 'Third Wave Coffee',
    area: 'EcoWorld',
    location: {
      latitude: 12.9244555014903,
      longitude: 77.6887498574217,
      source:
        'https://stores.thirdwavecoffeeroasters.com/store-pages/third-wave-coffee-ecoworld-4ab-bengaluru',
    },
    dishes: [
      ['Cream Bagel without Kakdi', 5, 5],
      ['Coffee', 7, 6.5],
    ],
  },
  {
    title: 'Bistro Claytopia',
    area: 'Koramangala',
    location: {
      latitude: 12.9255456,
      longitude: 77.6333329,
      source: 'https://www.latlong.net/poi/bistro-claytopia-446820',
    },
    dishes: [
      ['Cripy Corn', 8, 8],
      ['Bubblegum Boba', 10, 8.5],
      ['Mocha Cold Coffee', 3, 7.5],
      ['Pasta', 6, 7],
    ],
  },
  {
    title: 'Chulha Choki',
    area: 'Sarjapur',
    location: {
      latitude: 12.909932787399825,
      longitude: 77.6828854740945,
      source: 'https://www.chulhachaukidadhaba.com/our-branches/sarjapur-road/',
    },
    mapQuery: 'Chulha Chauki Da Dhaba Sarjapur Road Bengaluru',
    dishes: [
      ['Masala Papad', 5, 5],
      ['Kaju Paneer', 8, 8, 'Spicy'],
      ['Roti', null, null],
      ['Chaach', 8, null],
      ['Nimbu Pani', null, 8],
    ],
  },
  {
    title: 'Filter Coffee',
    area: 'Brookfield',
    location: {
      latitude: 12.9626445,
      longitude: 77.7166434,
      source: 'https://www.latlong.net/poi/the-filter-coffee-448424',
    },
    dishes: [
      ['Steam Idli', 8.5, 7, 'Good Chutney, Sambar bad, red chutney bad'],
      ['Rawa Dosa', 8, 7.5],
      ['Podi Idli/Dosa', null, null, 'Missing'],
    ],
  },
  { title: 'Amintri', dishes: [['Mini Croissant + Nutella/Berry', 9, 9]] },
  { title: 'Glens', dishes: [['Blueberry Cheesecake', 3, 3, 'Old baaeh']] },
  { title: 'Shubh Sweets', area: 'HSR', dishes: [['Pani Puri', 3, 5]] },
  {
    title: 'Brik Oven',
    area: 'HSR',
    location: {
      latitude: 12.9136422,
      longitude: 77.644891,
      source: 'https://www.latlong.net/poi/brik-oven-449376',
    },
    dishes: [
      ['Coba Pizza', 8.5, 8.5, 'Mini is very mini'],
      ['Margherita', 7, 7.5],
      ['Clasic cheesecake', 9, 10],
    ],
  },
  {
    title: 'Zoeys',
    dishes: [
      ['Jalapeno Chees Balls', 9.5, 9.5],
      ['Hakka Noodles', 8, 6.5],
      ['Pancake', 8, 8],
      ['Cold Coffee', null, 9],
      ['Lemongrass Cooler', 6.5, null],
    ],
  },
  {
    title: 'Poha On Wheels',
    dishes: [
      ['Poha', 9, 8],
      ['Jalebi', 9, 9.5],
    ],
  },
  { title: 'Puneri Chai', dishes: [['Chai', 8, 8]] },
  { title: 'Thar Restaurant', dishes: [['Dal Bati', 6, 7.5]] },
  {
    title: 'Amudham',
    dishes: [
      [
        'Ghee Masala Dosa',
        8.5,
        null,
        undefined,
        'Original note: 8.59; rounded to the nearest half-point.',
      ],
      ['Ghee Podi Dosa', null, 8],
    ],
  },
  {
    title: 'Bier Garten',
    dishes: [
      ['Mac N Cheese', 9.5, 10],
      ['Burger Slider', null, 7],
      ['Nachos', 9.5, 6.5],
    ],
  },
  {
    title: 'Anand Sweets',
    dishes: [
      ['Pav Bhaji', 7, 8.5],
      ['Chole Tikki', 9, 9],
    ],
  },
  {
    title: 'DYU Art Cafe',
    area: 'Koramangala',
    location: {
      latitude: 12.9371896,
      longitude: 77.6176798,
      source: 'https://www.latlong.net/poi/dyu-art-cafe-467846',
    },
    dishes: [
      ['Cheese Burger', null, 8.5],
      ['Mexican Veg Pizza', 8.5, 9],
      ['Vietnamese Iced Coffee', null, 8],
      ['Coffee Frappe', 8.5, null],
    ],
  },
  { title: 'Udupi', dishes: [['Paneer Lababdar', null, 8]] },
  { title: 'Udupi', visitNumber: 2, dishes: [['Kaju Masala', 6, 8]] },
  {
    title: 'Rameshwaram Cafe',
    dishes: [
      ['Ghee Podi Idli', 10, 9],
      ['Butter Masala Dosa', 7.5, null],
      ['Ghee Podi Dosa', null, 7],
    ],
  },
  {
    title: 'Cosmo Dhaba',
    dishes: [
      ['Tomato Soup', 8.5, 7],
      ['Babycorn Manchurian', 8.5, 9.5],
      ['Dhabewala Paneer', 7, 8],
      ['Cosmic Kofta', 8, 8.5],
      ['Fresh Lime Soda', null, 9],
    ],
  },
  {
    title: 'Uttari Betta',
    area: 'Near Bangalore',
    location: { latitude: 12.95592, longitude: 77.12105, source: 'https://mapcarta.com/34847426' },
    notes: 'Difficulty: Easy\nTrip: Tired as fuck\nPhotos: 10/10 (no individual rater recorded)',
    categories: [
      ['Enjoyment', 8, 8],
      ['View', 8, 7.5, 'Too crowdy'],
    ],
  },
  {
    title: 'Byg Brewski',
    dishes: [
      ['Nachos', 9, 9],
      ['Paneer Bao', 8, 9],
      ['Cosmo', 9, null],
      ['Two and Half Men', null, 9],
    ],
  },
];
