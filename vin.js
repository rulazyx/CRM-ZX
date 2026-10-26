// Décodage VIN gratuit et hors ligne : marque (3 premiers caractères)
// et année modèle (10e caractère). Le modèle et la finition ne sont pas
// lisibles dans un VIN européen sans base payante.
const VIN = (() => {
  const WMI = {
    VF1: 'Renault', VF2: 'Renault', VF6: 'Renault Trucks', VF3: 'Peugeot', VF7: 'Citroën',
    VR1: 'DS', VR3: 'Peugeot', VR7: 'Citroën', VXK: 'Opel', VNK: 'Toyota', VF8: 'Matra',
    UU1: 'Dacia', UU6: 'Dacia', VSS: 'Seat', VS6: 'Ford', VSK: 'Nissan', VS7: 'Citroën',
    VSX: 'Opel', VWV: 'Volkswagen', TMB: 'Škoda', TMA: 'Hyundai', TRU: 'Audi',
    WVW: 'Volkswagen', WV1: 'Volkswagen Utilitaires', WV2: 'Volkswagen Utilitaires',
    WAU: 'Audi', WUA: 'Audi', WBA: 'BMW', WBS: 'BMW M', WBY: 'BMW i', WMW: 'Mini',
    WDD: 'Mercedes-Benz', WDB: 'Mercedes-Benz', WDC: 'Mercedes-Benz', WDF: 'Mercedes-Benz',
    W1K: 'Mercedes-Benz', W1N: 'Mercedes-Benz', W1V: 'Mercedes-Benz', WME: 'Smart',
    WP0: 'Porsche', WP1: 'Porsche', W0L: 'Opel', W0V: 'Opel', WF0: 'Ford',
    ZFA: 'Fiat', ZFF: 'Ferrari', ZAR: 'Alfa Romeo', ZCF: 'Iveco', ZLA: 'Lancia', ZAC: 'Jeep',
    SAL: 'Land Rover', SAJ: 'Jaguar', SCC: 'Lotus', SJN: 'Nissan', SB1: 'Toyota',
    SHH: 'Honda', SHS: 'Honda', TSM: 'Suzuki', TMK: 'Kia',
    VSE: 'Suzuki', YV1: 'Volvo', YV4: 'Volvo', YS3: 'Saab',
    JTD: 'Toyota', JTE: 'Toyota', JTN: 'Toyota', JT1: 'Toyota', JTM: 'Toyota', JTH: 'Lexus',
    JN1: 'Nissan', JN8: 'Nissan', JHM: 'Honda', JMZ: 'Mazda', JM1: 'Mazda', JMB: 'Mitsubishi',
    JS1: 'Suzuki', JS2: 'Suzuki', JS3: 'Suzuki', JF1: 'Subaru', JDA: 'Daihatsu',
    KMH: 'Hyundai', KNA: 'Kia', KNE: 'Kia', KNM: 'Renault Samsung', KPT: 'SsangYong',
    MA3: 'Suzuki (Inde)', MAL: 'Hyundai (Inde)', MMB: 'Mitsubishi', MR0: 'Toyota (Thaïlande)',
    MNT: 'Nissan', NMT: 'Toyota', LSJ: 'MG', LVS: 'Ford (Chine)', LRW: 'Tesla', LGX: 'BYD',
    LC0: 'BYD', '5YJ': 'Tesla', XW8: 'Volkswagen', X7L: 'Renault', Y6D: 'Daewoo',
    '1FA': 'Ford', '1G1': 'Chevrolet', '1C4': 'Jeep', '1J4': 'Jeep', '2T1': 'Toyota', '3VW': 'Volkswagen',
  };
  const PREFIX2 = { VF: 'France (constructeur à préciser)', WD: 'Mercedes-Benz', JT: 'Toyota', W0: 'Opel', ZF: 'Fiat' };
  const YEAR_CODES = 'ABCDEFGHJKLMNPRSTVWXY123456789'; // A=1980 … 9=2009, puis cycle de 30 ans

  function clean(v) { return (v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  function decode(raw) {
    const vin = clean(raw);
    if (vin.length !== 17) return { ok: false, error: 'Un VIN fait 17 caractères (' + vin.length + ' saisis).' };
    if (/[IOQ]/.test(vin)) return { ok: false, error: 'Un VIN ne contient jamais les lettres I, O ou Q.' };
    const marque = WMI[vin.slice(0, 3)] || PREFIX2[vin.slice(0, 2)] || '';
    let annee = '';
    const i = YEAR_CODES.indexOf(vin[9]);
    if (i >= 0) {
      // Les constructeurs européens ne remplissent pas toujours ce caractère : année indicative.
      const thisYear = new Date().getFullYear() + 1;
      let y = 1980 + i;
      while (y + 30 <= thisYear) y += 30;
      annee = String(y);
    }
    return { ok: true, vin, marque, annee };
  }

  return { decode, clean };
})();

// Plaque : format SIV (AA-123-AA) ou ancien format FNI (ex. 1234 AB 974).
function formatPlaque(raw) {
  const p = (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const siv = p.match(/^([A-Z]{2})(\d{3})([A-Z]{2})$/);
  if (siv) return siv[1] + '-' + siv[2] + '-' + siv[3];
  const fni = p.match(/^(\d{1,4})([A-Z]{1,3})(\d{2,3})$/);
  if (fni) return fni[1] + ' ' + fni[2] + ' ' + fni[3];
  return (raw || '').toUpperCase().trim();
}
