import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AiService } from './ai.service';
import { environment } from '../../../environments/environment';

describe('AiService', () => {
  let service: AiService;
  let http: HttpTestingController;
  const baseUrl = `${environment.apiBaseUrl}${environment.apiV1Prefix}`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('posts text classification requests', () => {
    service.classifyRequest('Necesito un trámite técnico').subscribe((response) => {
      expect(response.suggestions.length).toBe(1);
    });

    const req = http.expectOne(`${baseUrl}/ai/classify-request`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ text: 'Necesito un trámite técnico' });
    req.flush({ suggestions: [{ policy_id: 'p1', policy_name: 'Tecnico', confidence: 0.9, reason: 'match' }] });
  });

  it('posts audio classification as multipart form data', () => {
    service.classifyRequestFromAudio(new Blob(['audio'], { type: 'audio/webm' })).subscribe((response) => {
      expect(response.transcribed_text).toBe('texto transcrito');
    });

    const req = http.expectOne(`${baseUrl}/ai/classify-request/audio`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBeTrue();
    expect((req.request.body as FormData).has('audio')).toBeTrue();
    req.flush({ suggestions: [], transcribed_text: 'texto transcrito' });
  });
});
