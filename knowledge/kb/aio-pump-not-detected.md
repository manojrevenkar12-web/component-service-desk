---
title: BIOS does not detect the AIO pump or shows a CPU fan error
summary_en: Connect the pump cable to the AIO_PUMP or CPU_FAN header, set that header to full speed in the BIOS, and disable the CPU fan warning if the pump reports speed on a different header.
summary_de: Schließen Sie das Pumpenkabel an AIO_PUMP oder CPU_FAN an, stellen Sie diesen Anschluss im BIOS auf volle Drehzahl und schalten Sie die CPU-Lüfterwarnung ab, falls die Pumpe an einem anderen Anschluss meldet.
summary_fr: Branchez le câble de la pompe sur AIO_PUMP ou CPU_FAN, réglez ce connecteur à pleine vitesse dans le BIOS et désactivez l’alerte du ventilateur CPU si la pompe remonte sa vitesse ailleurs.
summary_pl: Podłącz kabel pompy do złącza AIO_PUMP lub CPU_FAN, ustaw to złącze w BIOS-ie na pełne obroty i wyłącz ostrzeżenie o wentylatorze CPU, jeśli pompa raportuje obroty na innym złączu.
---
1. Connect the pump tachometer cable to AIO_PUMP, or to CPU_FAN if the board has no pump header.
2. In the BIOS set the header to full speed (DC or PWM 100%).
3. If the pump runs from a different header, set CPU fan warnings to ignore.
