// Reemplazar EC2_PUBLIC_IP con la IP pública de tu instancia EC2
// Ejemplo: 'http://54.123.45.67:8001'
export const environment = {
  production: true,
  apiBaseUrl: 'http://EC2_PUBLIC_IP:8001',
  apiV1Prefix: '/api/v1',
  wsUrl: 'ws://EC2_PUBLIC_IP:8001/ws',
};
