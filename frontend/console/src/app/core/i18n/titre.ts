import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';

/** Titre d'onglet : `title` des routes = clé de traduction, suffixée du nom de la console. */
@Injectable()
export class TitreTraduit extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly transloco = inject(TranslocoService);

  override updateTitle(etat: RouterStateSnapshot): void {
    const cle = this.buildTitle(etat);
    const suffixe = this.transloco.translate('app.titreOnglet');
    this.title.setTitle(cle ? `${this.transloco.translate(cle)} · ${suffixe}` : suffixe);
  }
}
