import { Component } from '@angular/core';
import { ComponentFixture, TestBed, discardPeriodicTasks, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { NEVER } from 'rxjs';

import { IaApiService } from '../../services/ia-api.service';
import { AiAdvisorShellComponent } from './ai-advisor-shell.component';

@Component({ template: '', standalone: true })
class PageVideComponent {}

describe('AiAdvisorShellComponent', () => {
  let fixture: ComponentFixture<AiAdvisorShellComponent>;
  let component: AiAdvisorShellComponent;
  let router: Router;
  let predict: jasmine.Spy;

  beforeEach(async () => {
    predict = jasmine.createSpy('predict').and.returnValue(NEVER);
    await TestBed.configureTestingModule({
      imports: [AiAdvisorShellComponent],
      providers: [
        provideRouter([
          { path: 'dashboard', component: PageVideComponent },
          { path: 'trading', component: PageVideComponent },
          { path: 'market', component: PageVideComponent },
          { path: 'portfolio', component: PageVideComponent },
        ]),
        { provide: IaApiService, useValue: { predict } },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(AiAdvisorShellComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
    document.body.style.overflow = '';
  });

  it('affiche le bouton flottant sur Dashboard', fakeAsync(() => {
    aller('/dashboard');
    expect(boutonAdvisor()).toBeTruthy();
    expect(boutonAdvisor()?.textContent).toContain('AI Advisor');
    expect(tiroir()).toBeNull();
    expect(predict).not.toHaveBeenCalled();
    terminer();
  }));

  it('affiche le bouton flottant sur Trading', fakeAsync(() => {
    aller('/trading');
    expect(boutonAdvisor()).toBeTruthy();
    expect(tiroir()).toBeNull();
    expect(predict).not.toHaveBeenCalled();
    terminer();
  }));

  it('masque le bouton hors Dashboard et Trading', fakeAsync(() => {
    aller('/dashboard');
    expect(boutonAdvisor()).toBeTruthy();

    aller('/market');
    expect(boutonAdvisor()).toBeNull();
    expect(tiroir()).toBeNull();

    aller('/portfolio');
    expect(boutonAdvisor()).toBeNull();
    terminer();
  }));

  it('ouvre le tiroir et l’overlay, puis masque le bouton flottant', fakeAsync(() => {
    aller('/dashboard');
    boutonAdvisor()?.click();
    fixture.detectChanges();

    expect(component.ouvert()).toBeTrue();
    expect(tiroir()).toBeTruthy();
    expect(tiroir()?.getAttribute('role')).toBe('dialog');
    expect(tiroir()?.getAttribute('aria-modal')).toBe('true');
    expect(overlay()).toBeTruthy();
    expect(boutonAdvisor()).toBeNull();
    expect(texte()).toContain('AI Advisor');
    expect(texte()).toContain('Chargement de la prédiction BTCUSDT 1 h');
    expect(document.body.style.overflow).toBe('hidden');
    expect(predict).toHaveBeenCalledOnceWith(true);
    terminer();
  }));

  it('ferme le panneau au clic sur l’overlay', fakeAsync(() => {
    aller('/dashboard');
    boutonAdvisor()?.click();
    fixture.detectChanges();
    expect(tiroir()).toBeTruthy();

    overlay()?.click();
    fixture.detectChanges();
    tick();

    expect(component.ouvert()).toBeFalse();
    expect(tiroir()).toBeNull();
    expect(overlay()).toBeNull();
    expect(boutonAdvisor()).toBeTruthy();
    terminer();
  }));

  it('ferme le panneau avec Échap', fakeAsync(() => {
    aller('/dashboard');
    boutonAdvisor()?.click();
    fixture.detectChanges();
    expect(component.ouvert()).toBeTrue();

    component.onEscape();
    fixture.detectChanges();
    tick();

    expect(component.ouvert()).toBeFalse();
    expect(tiroir()).toBeNull();
    expect(boutonAdvisor()).toBeTruthy();
    terminer();
  }));

  it('ferme aussi lorsque Échap est envoyé au document', fakeAsync(() => {
    aller('/dashboard');
    boutonAdvisor()?.click();
    fixture.detectChanges();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    tick();

    expect(component.ouvert()).toBeFalse();
    terminer();
  }));

  it('ferme le panneau via le bouton Fermer du tiroir', fakeAsync(() => {
    aller('/dashboard');
    boutonAdvisor()?.click();
    fixture.detectChanges();

    const fermer = fixture.nativeElement.querySelector('[aria-label="Fermer l\'AI Advisor"]') as HTMLButtonElement;
    expect(fermer).toBeTruthy();
    fermer.click();
    fixture.detectChanges();
    tick();

    expect(component.ouvert()).toBeFalse();
    expect(tiroir()).toBeNull();
    terminer();
  }));

  it('ferme et masque le conseiller en quittant Dashboard ou Trading', fakeAsync(() => {
    aller('/trading');
    boutonAdvisor()?.click();
    fixture.detectChanges();
    expect(tiroir()).toBeTruthy();

    aller('/market');
    expect(component.visible()).toBeFalse();
    expect(component.ouvert()).toBeFalse();
    expect(tiroir()).toBeNull();
    expect(boutonAdvisor()).toBeNull();
    terminer();
  }));

  it('n’appelle predict qu’à l’ouverture, sans polling réseau', fakeAsync(() => {
    aller('/dashboard');
    tick(5_000);
    expect(predict).not.toHaveBeenCalled();

    boutonAdvisor()?.click();
    fixture.detectChanges();
    expect(predict).toHaveBeenCalledOnceWith(true);

    tick(5_000);
    expect(predict).toHaveBeenCalledTimes(1);
    terminer();
  }));

  it('conserve le thème sombre et les attributs d’accessibilité', fakeAsync(() => {
    aller('/dashboard');
    const fab = boutonAdvisor();
    expect(fab?.className).toContain('bg-crypto-card');
    expect(fab?.getAttribute('aria-haspopup')).toBe('dialog');
    expect(fab?.getAttribute('aria-controls')).toBe('ai-advisor-drawer');

    fab?.click();
    fixture.detectChanges();
    expect(tiroir()?.className).toContain('bg-crypto-card');
    expect(tiroir()?.id).toBe('ai-advisor-drawer');
    terminer();
  }));

  function terminer(): void {
    component.fermer();
    fixture.detectChanges();
    fixture.destroy();
    discardPeriodicTasks();
  }

  function aller(url: string): void {
    fixture.ngZone?.run(() => {
      void router.navigateByUrl(url);
    });
    tick();
    fixture.detectChanges();
  }

  function boutonAdvisor(): HTMLButtonElement | null {
    const boutons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    return boutons.find((b) => (b.textContent ?? '').trim() === 'AI Advisor') ?? null;
  }

  function tiroir(): HTMLElement | null {
    return fixture.nativeElement.querySelector('#ai-advisor-drawer');
  }

  function overlay(): HTMLElement | null {
    return fixture.nativeElement.querySelector('div.fixed.inset-0');
  }

  function texte(): string {
    return (fixture.nativeElement.textContent as string) ?? '';
  }
});
