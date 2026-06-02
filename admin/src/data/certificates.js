import { supabase } from './supabase.js';
import { updateEvent } from './events.js';

const BUCKET = 'certificates';

// Faz upload do template PNG no Storage. Path: {eventId}/template.png
// Retorna a URL pública.
export async function uploadCertificateTemplate(eventId, file) {
  const path = `${eventId}/template.png`;

  // Upload com upsert (substitui se já existe)
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      upsert: true,
      contentType: file.type || 'image/png',
      cacheControl: '3600'
    });

  if (upErr) {
    console.error('Erro no upload:', upErr);
    throw new Error(upErr.message || 'Falha no upload do certificado');
  }

  // Pega URL pública
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!pub?.publicUrl) throw new Error('Não foi possível gerar URL do certificado');

  // Adiciona timestamp pra forçar bypass de cache (importante quando substitui)
  return `${pub.publicUrl}?v=${Date.now()}`;
}

// Salva o layout completo do certificado no banco.
//   layout: array de slots [{ key, x, y, size, align }]
//   hours: carga horária (number)
export async function saveCertificateConfig(eventId, { templateUrl, layout, hours }) {
  const patch = {
    certificate_template_url: templateUrl,
    certificate_layout: layout,
    certificate_hours: hours
  };
  return updateEvent(eventId, patch);
}

// Deleta o template do Storage (se quiser resetar)
export async function removeCertificateTemplate(eventId) {
  const path = `${eventId}/template.png`;
  await supabase.storage.from(BUCKET).remove([path]);
  await updateEvent(eventId, {
    certificate_template_url: null,
    certificate_layout: null
  });
}

// Layout padrão (centro do certificado)
export function defaultLayout() {
  return [
    { key: 'NOME',  x: 0.5, y: 0.45, size: 56, align: 'center' },
    { key: 'DATA',  x: 0.5, y: 0.62, size: 22, align: 'center' },
    { key: 'HORAS', x: 0.5, y: 0.70, size: 22, align: 'center' }
  ];
}
