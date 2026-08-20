program CrabInvaders;

{ =============================================================================
  CRAB INVADERS — THE BANCAL DEFENDER
  Fuente único. Todo lo demás (CrabInvaders.js) se genera con:

      pas2js -Tbrowser -Jc -Jirtl.js -Jm -Jminclude -vwnh CrabInvaders.pas

  Cambios respecto de la primera versión:
   · Máquina de estados (espera / jugando / fin) en lugar de un booleano.
   · Pantalla de inicio con botón: el juego ya no arranca solo.
   · Movimiento por segundo, no por frame: corre igual a 60 y a 144 Hz.
   · HUD dibujado en el canvas: una sola fuente de verdad, sin tocar el DOM.
   · preventDefault: la barra espaciadora ya no scrollea la página.
  ============================================================================= }

{$MODE OBJFPC}
{$H+}

uses
  JS, Web, SysUtils, Math;

// =============================================================================
// CONSTANTES
// =============================================================================

const
  // --- Lienzo ---
  ANCHO = 800;
  ALTO  = 500;

  // --- Mundo ---
  BANCAL_Y     = 430;   // borde superior de la tierra: también la línea de derrota
  BANCAL_X     = 30;
  BANCAL_W     = 740;
  MARGEN_LATERAL = 10;
  MARGEN_BICHO   = 20;

  // --- Capacidad de los depósitos ---
  MAX_LASERS = 50;
  MAX_BICHOS = 100;

  // --- Velocidades, TODAS en unidades por segundo ---
  CANGREJO_VEL = 360.0;   // 6 px por frame a 60 fps
  LASER_VEL    = 540.0;   // 9 px por frame a 60 fps

  BICHO_VY_MIN = 36.0;    // 0.6 px/frame
  BICHO_VY_VAR = 48.0;    // + hasta 0.8 px/frame
  BICHO_VX_MIN = 30.0;
  BICHO_VX_VAR = 90.0;

  ZIGZAG_VEL   = 6.0;     // rad/s: avance de fase de la mosca blanca
  ZIGZAG_AMPL  = 120.0;   // px/s de desplazamiento lateral

  // --- Ritmo de aparición, en segundos ---
  SPAWN_INICIAL = 1.5;
  SPAWN_MINIMO  = 0.5;
  SPAWN_PASO    = 0.08;   // se acelera cada 5 plagas eliminadas

  // --- Tamaños ---
  LASER_W    = 4.0;
  LASER_H    = 20.0;
  BICHO_LADO = 24.0;

  VIDAS_INICIALES = 3;

  { Techo del paso de tiempo. Si el navegador manda la pestaña al fondo, el
    TimeStamp pega un salto de varios segundos: sin este tope, las plagas
    atravesarían el bancal en un solo frame. }
  DT_MAXIMO = 0.05;

  // --- Paleta ---
  C_FONDO      = '#091524';
  C_TIERRA     = '#5a3d28';
  C_TIERRA_OSC = '#3d2516';
  C_TRONCO     = '#5c4033';
  C_COPA       = '#145214';
  C_CANGREJO   = '#e63232';
  C_PINZA      = '#b41e1e';
  C_OJO        = '#00ccff';
  C_LASER      = '#00ffff';
  C_HUD        = '#00ffcc';
  C_ALERTA     = '#ff4444';
  C_ACENTO     = '#aaffaa';

// =============================================================================
// TIPOS
// =============================================================================

type
  TEstadoJuego = (ejEspera, ejJugando, ejFin);

  TBichoTipo = (btPulgon, btMoscaBlanca, btSaltamontes, btChincheRoja);

  TCaja = record
    X, Y, W, H: Double;
  end;

  TCangrejo = record
    X, Y: Double;
    W, H: Double;
    Velocidad: Double;
  end;

  TLaser = record
    X, Y: Double;
    W, H: Double;
    Velocidad: Double;
    Activo: Boolean;
  end;

  TBicho = record
    X, Y: Double;
    W, H: Double;
    VelX, VelY: Double;
    FaseZigZag: Double;
    Tipo: TBichoTipo;
    Vida, MaxVida: Integer;
    Activo: Boolean;
  end;

// =============================================================================
// ESTADO GLOBAL
// =============================================================================

var
  Canvas: TJSHTMLCanvasElement;
  Ctx: TJSCanvasRenderingContext2D;

  EstadoJuego: TEstadoJuego;

  Cangrejo: TCangrejo;
  Lasers: array[1..MAX_LASERS] of TLaser;
  Bichos: array[1..MAX_BICHOS] of TBicho;

  Score, Vidas, PlagasEliminadas: Integer;
  TiempoSpawn: Double;          // segundos acumulados desde la última plaga
  TiempoPrevio: Double;         // marca del frame anterior, en milisegundos

  KeyLeft, KeyRight, KeySpace: Boolean;

  Boton: TCaja;                 // geometría única: se dibuja y se testea de acá
  BotonCaliente: Boolean;       // el mouse está encima

// =============================================================================
// UTILIDADES
// =============================================================================

function PuntoEnCaja(PX, PY: Double; const C: TCaja): Boolean;
begin
  Result := (PX >= C.X) and (PX <= C.X + C.W) and
            (PY >= C.Y) and (PY <= C.Y + C.H);
end;

procedure TextoCentrado(const S: String; Y: Double);
begin
  Ctx.textAlign := 'center';
  Ctx.fillText(S, ANCHO / 2, Y);
end;

// =============================================================================
// LÓGICA DE PARTIDA
// =============================================================================

{ Deja todo listo para jugar, pero NO decide el estado: eso lo hace quien llama.
  Así la misma rutina sirve para el arranque en frío y para el reinicio. }
procedure PrepararPartida;
var
  i: Integer;
begin
  Cangrejo.W := 60;
  Cangrejo.H := 50;
  Cangrejo.X := (ANCHO - Cangrejo.W) / 2;
  Cangrejo.Y := 380;
  Cangrejo.Velocidad := CANGREJO_VEL;

  Score := 0;
  Vidas := VIDAS_INICIALES;
  PlagasEliminadas := 0;
  TiempoSpawn := 0;

  KeyLeft := False;
  KeyRight := False;
  KeySpace := False;

  for i := 1 to MAX_LASERS do Lasers[i].Activo := False;
  for i := 1 to MAX_BICHOS do Bichos[i].Activo := False;
end;

procedure SpawnInsecto;
var
  i, arbolOrigen: Integer;
  velXBase: Double;
begin
  for i := 1 to MAX_BICHOS do
  begin
    if not Bichos[i].Activo then
    begin
      arbolOrigen := Random(2);
      if arbolOrigen = 0 then
        Bichos[i].X := 50 + Random(60)
      else
        Bichos[i].X := 690 + Random(60);

      Bichos[i].Y := 30 + Random(20);
      Bichos[i].W := BICHO_LADO;
      Bichos[i].H := BICHO_LADO;
      Bichos[i].FaseZigZag := Random * 10;
      Bichos[i].Activo := True;

      Bichos[i].Tipo := TBichoTipo(Random(4));

      velXBase := BICHO_VX_MIN + Random * BICHO_VX_VAR;
      if arbolOrigen = 1 then velXBase := -velXBase;

      case Bichos[i].Tipo of
        btPulgon:
          begin
            Bichos[i].Vida := 1;
            Bichos[i].VelX := velXBase;
            Bichos[i].VelY := BICHO_VY_MIN + Random * BICHO_VY_VAR;
          end;
        btMoscaBlanca:
          begin
            Bichos[i].Vida := 1;
            Bichos[i].VelX := velXBase * 1.5;
            Bichos[i].VelY := BICHO_VY_MIN + Random * BICHO_VY_VAR;
          end;
        btSaltamontes:
          begin
            Bichos[i].Vida := 2;          // aguanta dos impactos
            Bichos[i].VelX := velXBase;
            Bichos[i].VelY := (BICHO_VY_MIN + Random * BICHO_VY_VAR) * 0.7;
          end;
        btChincheRoja:
          begin
            Bichos[i].Vida := 1;
            Bichos[i].VelX := velXBase * 1.3;
            Bichos[i].VelY := (BICHO_VY_MIN + Random * BICHO_VY_VAR) * 1.25;
          end;
      end;

      Bichos[i].MaxVida := Bichos[i].Vida;
      Break;
    end;
  end;
end;

{ Dispara dos láseres, uno por cada pinza. Reserva los dos lugares antes de
  activar nada: si el depósito solo tiene uno libre, no dispara a medias. }
procedure Disparar;
var
  i, primero, segundo: Integer;
begin
  primero := 0;
  segundo := 0;

  for i := 1 to MAX_LASERS do
    if not Lasers[i].Activo then
    begin
      if primero = 0 then
        primero := i
      else
      begin
        segundo := i;
        Break;
      end;
    end;

  if (primero = 0) or (segundo = 0) then Exit;

  Lasers[primero].X := Cangrejo.X + 16;
  Lasers[primero].Y := Cangrejo.Y + 10;
  Lasers[primero].W := LASER_W;
  Lasers[primero].H := LASER_H;
  Lasers[primero].Velocidad := LASER_VEL;
  Lasers[primero].Activo := True;

  Lasers[segundo].X := Cangrejo.X + Cangrejo.W - 20;
  Lasers[segundo].Y := Cangrejo.Y + 10;
  Lasers[segundo].W := LASER_W;
  Lasers[segundo].H := LASER_H;
  Lasers[segundo].Velocidad := LASER_VEL;
  Lasers[segundo].Activo := True;
end;

procedure IniciarPartida;
begin
  PrepararPartida;
  EstadoJuego := ejJugando;
end;

// =============================================================================
// ENTRADA
// =============================================================================

function TeclaAbajo(E: TJSKeyBoardEvent): Boolean;
begin
  Result := True;

  case EstadoJuego of
    ejEspera:
      if (E.Code = 'Space') or (E.Code = 'Enter') then
      begin
        IniciarPartida;
        KeySpace := True;    // evita que este mismo golpe dispare
      end;

    ejJugando:
      begin
        if E.Code = 'ArrowLeft'  then KeyLeft := True;
        if E.Code = 'ArrowRight' then KeyRight := True;
        if E.Code = 'Space' then
        begin
          if not KeySpace then Disparar;   // solo en el flanco, no con el autorepeat
          KeySpace := True;
        end;
      end;

    ejFin:
      if (E.Code = 'KeyR') or (E.Code = 'Enter') then IniciarPartida;
  end;

  // Sin esto, las flechas y la barra espaciadora scrollean la página.
  if (E.Code = 'ArrowLeft') or (E.Code = 'ArrowRight') or
     (E.Code = 'Space') or (E.Code = 'ArrowUp') or (E.Code = 'ArrowDown') then
    E.preventDefault;
end;

function TeclaArriba(E: TJSKeyBoardEvent): Boolean;
begin
  Result := True;
  if E.Code = 'ArrowLeft'  then KeyLeft := False;
  if E.Code = 'ArrowRight' then KeyRight := False;
  if E.Code = 'Space'      then KeySpace := False;
end;

{ offsetX/offsetY vienen relativos al canvas. Valen tal cual mientras el canvas
  no esté escalado por CSS: por eso el HTML lo deja en 800x500 reales. }
function ClickEnCanvas(E: TJSMouseEvent): Boolean;
begin
  Result := True;
  if EstadoJuego = ejJugando then Exit;
  if PuntoEnCaja(E.offsetX, E.offsetY, Boton) then IniciarPartida;
end;

function MoverMouse(E: TJSMouseEvent): Boolean;
begin
  Result := True;
  BotonCaliente := (EstadoJuego <> ejJugando) and
                   PuntoEnCaja(E.offsetX, E.offsetY, Boton);

  if BotonCaliente then
    Canvas.style.setProperty('cursor', 'pointer')
  else
    Canvas.style.setProperty('cursor', 'default');
end;

// =============================================================================
// ACTUALIZACIÓN — todo multiplicado por dt (segundos transcurridos)
// =============================================================================

procedure Actualizar(dt: Double);
var
  i, l, b: Integer;
  intervalo: Double;
begin
  // --- Cangrejo ---
  if KeyLeft and (Cangrejo.X > MARGEN_LATERAL) then
    Cangrejo.X := Cangrejo.X - Cangrejo.Velocidad * dt;
  if KeyRight and (Cangrejo.X < ANCHO - Cangrejo.W - MARGEN_LATERAL) then
    Cangrejo.X := Cangrejo.X + Cangrejo.Velocidad * dt;

  // --- Láseres ---
  for i := 1 to MAX_LASERS do
    if Lasers[i].Activo then
    begin
      Lasers[i].Y := Lasers[i].Y - Lasers[i].Velocidad * dt;
      if Lasers[i].Y + Lasers[i].H < 0 then Lasers[i].Activo := False;
    end;

  // --- Aparición de plagas ---
  TiempoSpawn := TiempoSpawn + dt;
  intervalo := Max(SPAWN_MINIMO,
                   SPAWN_INICIAL - (PlagasEliminadas div 5) * SPAWN_PASO);
  if TiempoSpawn >= intervalo then
  begin
    SpawnInsecto;
    TiempoSpawn := 0;
  end;

  // --- Plagas ---
  for i := 1 to MAX_BICHOS do
    if Bichos[i].Activo then
    begin
      Bichos[i].Y := Bichos[i].Y + Bichos[i].VelY * dt;

      if Bichos[i].Tipo = btMoscaBlanca then
      begin
        Bichos[i].FaseZigZag := Bichos[i].FaseZigZag + ZIGZAG_VEL * dt;
        Bichos[i].X := Bichos[i].X + Sin(Bichos[i].FaseZigZag) * ZIGZAG_AMPL * dt;
      end
      else
      begin
        Bichos[i].X := Bichos[i].X + Bichos[i].VelX * dt;

        { Rebote contra los bordes. El clamp no es decorativo: sin él, un bicho
          que se pasa del borde en un frame lento queda vibrando en la pared. }
        if Bichos[i].X < MARGEN_BICHO then
        begin
          Bichos[i].X := MARGEN_BICHO;
          Bichos[i].VelX := -Bichos[i].VelX;
        end
        else if Bichos[i].X + Bichos[i].W > ANCHO - MARGEN_BICHO then
        begin
          Bichos[i].X := ANCHO - MARGEN_BICHO - Bichos[i].W;
          Bichos[i].VelX := -Bichos[i].VelX;
        end;
      end;

      // Alcanzó la tierra del bancal
      if Bichos[i].Y + Bichos[i].H >= BANCAL_Y then
      begin
        Bichos[i].Activo := False;
        if Vidas > 0 then Dec(Vidas);
        if Vidas <= 0 then
        begin
          Vidas := 0;
          EstadoJuego := ejFin;
        end;
      end;
    end;

  // --- Colisiones láser / plaga (AABB) ---
  for l := 1 to MAX_LASERS do
    if Lasers[l].Activo then
      for b := 1 to MAX_BICHOS do
        if Bichos[b].Activo then
          if (Lasers[l].X < Bichos[b].X + Bichos[b].W) and
             (Lasers[l].X + Lasers[l].W > Bichos[b].X) and
             (Lasers[l].Y < Bichos[b].Y + Bichos[b].H) and
             (Lasers[l].Y + Lasers[l].H > Bichos[b].Y) then
          begin
            Lasers[l].Activo := False;
            Dec(Bichos[b].Vida);

            if Bichos[b].Vida <= 0 then
            begin
              case Bichos[b].Tipo of
                btPulgon:      Inc(Score, 10);
                btMoscaBlanca: Inc(Score, 20);
                btSaltamontes: Inc(Score, 30);
                btChincheRoja: Inc(Score, 45);
              end;
              Bichos[b].Activo := False;
              Inc(PlagasEliminadas);
            end;

            Break;   // este láser ya se consumió: no sigas buscando bichos
          end;
end;

// =============================================================================
// DIBUJO
// =============================================================================

procedure DibujarEscenario;
var
  xPos: Integer;
begin
  Ctx.fillStyle := C_FONDO;
  Ctx.fillRect(0, 0, ANCHO, ALTO);

  // Árboles de donde bajan las plagas
  Ctx.fillStyle := C_TRONCO;
  Ctx.fillRect(0, 0, 40, 120);
  Ctx.fillRect(ANCHO - 40, 0, 40, 120);

  Ctx.fillStyle := C_COPA;
  Ctx.beginPath;
  Ctx.arc(40, 60, 60, 0, 2 * Pi);
  Ctx.fill;
  Ctx.beginPath;
  Ctx.arc(ANCHO - 40, 60, 60, 0, 2 * Pi);
  Ctx.fill;

  // Bancal
  Ctx.fillStyle := C_TIERRA;
  Ctx.fillRect(BANCAL_X, BANCAL_Y, BANCAL_W, ALTO - BANCAL_Y);
  Ctx.fillStyle := C_TIERRA_OSC;
  Ctx.fillRect(BANCAL_X + 10, BANCAL_Y + 8, BANCAL_W - 20, ALTO - BANCAL_Y - 8);

  // Cultivos
  xPos := 70;
  while xPos < 750 do
  begin
    Ctx.fillStyle := '#228b22';
    Ctx.fillRect(xPos, 442, 6, 30);

    Ctx.fillStyle := '#ff2222';
    Ctx.beginPath; Ctx.arc(xPos - 3, 452, 4, 0, 2 * Pi); Ctx.fill;
    Ctx.beginPath; Ctx.arc(xPos + 8, 462, 4, 0, 2 * Pi); Ctx.fill;

    Ctx.fillStyle := '#52c652';
    Ctx.beginPath; Ctx.arc(xPos + 20, 470, 10, 0, 2 * Pi); Ctx.fill;
    Ctx.fillStyle := '#2eb82e';
    Ctx.beginPath; Ctx.arc(xPos + 20, 470, 6, 0, 2 * Pi); Ctx.fill;

    xPos := xPos + 55;
  end;
end;

{ El caparazón va con ellipse: pas2js NO expone roundRect. }
procedure DibujarCangrejo;
var
  cx, cy, w, h: Double;
  desp: Integer;
begin
  cx := Cangrejo.X;
  cy := Cangrejo.Y;
  w  := Cangrejo.W;
  h  := Cangrejo.H;

  // Patas
  Ctx.strokeStyle := C_PINZA;
  Ctx.lineWidth := 4;
  for desp := -12 to 12 do
    if (desp mod 8) = 0 then
    begin
      Ctx.beginPath;
      Ctx.moveTo(cx + 15, cy + h * 0.7);
      Ctx.lineTo(cx + desp, cy + h * 1.04);
      Ctx.stroke;

      Ctx.beginPath;
      Ctx.moveTo(cx + w - 15, cy + h * 0.7);
      Ctx.lineTo(cx + w - desp, cy + h * 1.04);
      Ctx.stroke;
    end;

  // Pinzas
  Ctx.fillStyle := C_PINZA;
  Ctx.fillRect(cx - 14, cy + 6, 16, 26);
  Ctx.fillRect(cx - 20, cy - 12, 18, 20);
  Ctx.fillRect(cx + w - 2, cy + 6, 16, 26);
  Ctx.fillRect(cx + w + 2, cy - 12, 18, 20);

  Ctx.fillStyle := C_CANGREJO;
  Ctx.fillRect(cx - 20, cy - 24, 6, 14);
  Ctx.fillRect(cx - 10, cy - 20, 6, 10);
  Ctx.fillRect(cx + w + 14, cy - 24, 6, 14);
  Ctx.fillRect(cx + w + 4, cy - 20, 6, 10);

  // Caparazón
  Ctx.fillStyle := C_CANGREJO;
  Ctx.beginPath;
  Ctx.ellipse(cx + w / 2, cy + h * 0.5, w / 2, h * 0.34, 0, 0, 2 * Pi);
  Ctx.fill;

  // Ojos
  Ctx.fillStyle := C_OJO;
  Ctx.fillRect(cx + 14, cy - 4, 8, 14);
  Ctx.fillRect(cx + w - 22, cy - 4, 8, 14);

  Ctx.fillStyle := '#ffffff';
  Ctx.beginPath; Ctx.arc(cx + 18, cy - 6, 5, 0, 2 * Pi); Ctx.fill;
  Ctx.beginPath; Ctx.arc(cx + w - 18, cy - 6, 5, 0, 2 * Pi); Ctx.fill;

  Ctx.fillStyle := '#000000';
  Ctx.beginPath; Ctx.arc(cx + 18, cy - 8, 2.5, 0, 2 * Pi); Ctx.fill;
  Ctx.beginPath; Ctx.arc(cx + w - 18, cy - 8, 2.5, 0, 2 * Pi); Ctx.fill;
end;

procedure DibujarLasers;
var
  i: Integer;
begin
  for i := 1 to MAX_LASERS do
    if Lasers[i].Activo then
    begin
      Ctx.fillStyle := 'rgba(0,255,255,0.35)';
      Ctx.fillRect(Lasers[i].X - 2, Lasers[i].Y, Lasers[i].W + 4, Lasers[i].H);
      Ctx.fillStyle := C_LASER;
      Ctx.fillRect(Lasers[i].X, Lasers[i].Y, Lasers[i].W, Lasers[i].H);
    end;
end;

procedure DibujarBichos;
var
  i: Integer;
  radio: Double;
begin
  for i := 1 to MAX_BICHOS do
    if Bichos[i].Activo then
    begin
      case Bichos[i].Tipo of
        btPulgon:      Ctx.fillStyle := '#3ae33a';
        btMoscaBlanca: Ctx.fillStyle := '#ffffff';
        btSaltamontes: Ctx.fillStyle := '#eedd22';
        btChincheRoja: Ctx.fillStyle := '#ff2222';
      end;

      radio := Bichos[i].W / 2;
      Ctx.beginPath;
      Ctx.arc(Bichos[i].X + radio, Bichos[i].Y + radio, radio, 0, 2 * Pi);
      Ctx.fill;

      Ctx.fillStyle := '#000000';
      Ctx.fillRect(Bichos[i].X + 6, Bichos[i].Y + 6, 3, 3);
      Ctx.fillRect(Bichos[i].X + Bichos[i].W - 9, Bichos[i].Y + 6, 3, 3);

      // Barra de vida, solo si ya recibió daño
      if (Bichos[i].MaxVida > 1) and (Bichos[i].Vida < Bichos[i].MaxVida) then
      begin
        Ctx.fillStyle := '#ff0000';
        Ctx.fillRect(Bichos[i].X, Bichos[i].Y - 8, Bichos[i].W, 4);
        Ctx.fillStyle := '#00ff00';
        Ctx.fillRect(Bichos[i].X, Bichos[i].Y - 8,
                     Bichos[i].W * (Bichos[i].Vida / Bichos[i].MaxVida), 4);
      end;
    end;
end;

procedure DibujarHUD;
begin
  Ctx.font := 'bold 16px monospace';
  Ctx.textBaseline := 'top';

  Ctx.textAlign := 'left';
  Ctx.fillStyle := C_HUD;
  Ctx.fillText('PUNTOS: ' + IntToStr(Score), 100, 14);

  Ctx.textAlign := 'center';
  Ctx.fillStyle := C_ALERTA;
  Ctx.fillText('VIDAS: ' + IntToStr(Vidas), ANCHO / 2, 14);

  Ctx.textAlign := 'right';
  Ctx.fillStyle := C_ACENTO;
  Ctx.fillText('PLAGAS: ' + IntToStr(PlagasEliminadas), ANCHO - 100, 14);

  Ctx.textBaseline := 'alphabetic';
  Ctx.textAlign := 'left';
end;

procedure DibujarBoton(const Texto: String);
begin
  if BotonCaliente then
    Ctx.fillStyle := '#00ffcc'
  else
    Ctx.fillStyle := '#00b894';
  Ctx.fillRect(Boton.X, Boton.Y, Boton.W, Boton.H);

  Ctx.strokeStyle := '#ffffff';
  Ctx.lineWidth := 2;
  Ctx.strokeRect(Boton.X, Boton.Y, Boton.W, Boton.H);

  Ctx.fillStyle := '#062018';
  Ctx.font := 'bold 22px monospace';
  Ctx.textAlign := 'center';
  Ctx.textBaseline := 'middle';
  Ctx.fillText(Texto, Boton.X + Boton.W / 2, Boton.Y + Boton.H / 2);
  Ctx.textBaseline := 'alphabetic';
end;

procedure DibujarPantallaInicio;
begin
  Ctx.fillStyle := 'rgba(4,10,20,0.88)';
  Ctx.fillRect(0, 0, ANCHO, ALTO);

  Ctx.fillStyle := C_ALERTA;
  Ctx.font := 'bold 46px monospace';
  TextoCentrado('CRAB INVADERS', 120);

  Ctx.fillStyle := C_HUD;
  Ctx.font := 'bold 26px monospace';
  TextoCentrado('THE BANCAL DEFENDER', 158);

  Ctx.fillStyle := '#ffffff';
  Ctx.font := '17px monospace';
  TextoCentrado('FLECHAS  ←  →    mover el cangrejo', 232);
  TextoCentrado('BARRA ESPACIADORA    disparar', 262);

  Ctx.fillStyle := '#9aa5b5';
  Ctx.font := '14px monospace';
  TextoCentrado('Defendé el bancal: si una plaga toca la tierra, perdés una vida.', 300);

  DibujarBoton('INICIAR');
end;

procedure DibujarPantallaFin;
begin
  Ctx.fillStyle := 'rgba(0,0,0,0.85)';
  Ctx.fillRect(0, 0, ANCHO, ALTO);

  Ctx.fillStyle := '#ff3333';
  Ctx.font := 'bold 40px monospace';
  TextoCentrado('¡FIN DEL JUEGO!', 170);

  Ctx.fillStyle := '#ffffff';
  Ctx.font := '18px monospace';
  TextoCentrado('Las plagas rompieron la defensa e invadieron el bancal.', 212);

  Ctx.fillStyle := C_HUD;
  Ctx.font := 'bold 22px monospace';
  TextoCentrado('Puntuación total: ' + IntToStr(Score) + ' pts', 256);

  Ctx.fillStyle := '#9aa5b5';
  Ctx.font := '14px monospace';
  TextoCentrado('También podés apretar R', 300);

  DibujarBoton('JUGAR DE NUEVO');
end;

procedure Render;
begin
  DibujarEscenario;
  DibujarCangrejo;
  DibujarLasers;
  DibujarBichos;
  DibujarHUD;

  case EstadoJuego of
    ejEspera: DibujarPantallaInicio;
    ejFin:    DibujarPantallaFin;
    ejJugando: ;   // en juego no va ninguna capa encima
  end;
end;

// =============================================================================
// BUCLE PRINCIPAL
// =============================================================================

procedure GameLoop(TimeStamp: Double);
var
  dt: Double;
begin
  if TiempoPrevio = 0 then TiempoPrevio := TimeStamp;
  dt := (TimeStamp - TiempoPrevio) / 1000;    // milisegundos → segundos
  TiempoPrevio := TimeStamp;
  if dt > DT_MAXIMO then dt := DT_MAXIMO;

  if EstadoJuego = ejJugando then Actualizar(dt);
  Render;

  window.requestAnimationFrame(@GameLoop);
end;

// =============================================================================
// ARRANQUE
// =============================================================================

begin
  Canvas := TJSHTMLCanvasElement(document.getElementById('gameCanvas'));
  Ctx := Canvas.getContextAs2DContext('2d');

  document.onkeydown := @TeclaAbajo;
  document.onkeyup   := @TeclaArriba;
  Canvas.onclick     := @ClickEnCanvas;
  Canvas.onmousemove := @MoverMouse;

  Boton.W := 240;
  Boton.H := 54;
  Boton.X := (ANCHO - Boton.W) / 2;
  Boton.Y := 350;
  BotonCaliente := False;

  TiempoPrevio := 0;
  PrepararPartida;
  EstadoJuego := ejEspera;      // esperando el botón: no arranca solo

  window.requestAnimationFrame(@GameLoop);
end.
