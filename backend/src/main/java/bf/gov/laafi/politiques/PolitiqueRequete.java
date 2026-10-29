package bf.gov.laafi.politiques;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record PolitiqueRequete(
        @Size(max = 255) String libelle,
        @NotNull Transfert transfert,
        boolean copie,
        @Min(1) @Max(3650) Integer expirationJours,
        boolean filigrane,
        boolean filigraneNominatif,
        boolean flouHorsFocus) {
}
