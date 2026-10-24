// src/components/ui/icons.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Единый набор иконок клиентской части и админки — Phosphor (https://phosphoricons.com).
// Экспортируются под старыми lucide-именами, чтобы страницы меняли только
// строку импорта.
//
// Толщина: по умолчанию regular; мелкие (≤14px) и «жирные» (strokeWidth ≥ 2.4) —
// bold, чтобы не терялись; fill (кроме 'none') — заливной вариант.
// ─────────────────────────────────────────────────────────────────────────────
import type { CSSProperties } from 'react'
import type { Icon as PhIcon, IconWeight } from '@phosphor-icons/react'
import {
  ArrowCounterClockwiseIcon, ArrowLeftIcon, ArrowsClockwiseIcon, CalendarBlankIcon,
  CaretDownIcon, CaretLeftIcon, CaretRightIcon, ChatCenteredTextIcon, ChatCircleIcon,
  CheckCircleIcon, CheckIcon, CircleIcon, CircleNotchIcon, ClockIcon, CopyIcon,
  CreditCardIcon, CrownIcon, CurrencyBtcIcon, DeviceMobileIcon, DiamondIcon, FileTextIcon,
  GameControllerIcon, GearSixIcon, GiftIcon, HeadsetIcon, HeartIcon, ImageSquareIcon, InfoIcon,
  LightningIcon, ListIcon, MagnifyingGlassIcon, MagnifyingGlassPlusIcon, MedalIcon, MinusIcon,
  PackageIcon, PaperPlaneRightIcon, PaperclipIcon, PercentIcon, PlusIcon, QuestionIcon,
  SealCheckIcon, ShareNetworkIcon, ShieldCheckIcon, ShieldIcon, ShoppingBagIcon,
  ShoppingCartIcon, SignOutIcon, StarIcon, TagIcon, ThumbsDownIcon, ThumbsUpIcon, TrashIcon, TrendDownIcon, TrendUpIcon,
  UsersIcon, WalletIcon, WarningCircleIcon, WifiSlashIcon, XCircleIcon, XIcon,
} from '@phosphor-icons/react'
import {
  ArrowSquareOutIcon, ArrowsInSimpleIcon, EyeIcon, EyeSlashIcon, ArrowsOutSimpleIcon, BellIcon, ChatCenteredIcon, CloudArrowUpIcon, EnvelopeSimpleIcon, CurrencyDollarIcon, FloppyDiskIcon, FolderOpenIcon, ImageBrokenIcon, ImageIcon, MinusCircleIcon, PencilSimpleIcon, PlusCircleIcon, PushPinIcon, ShieldSlashIcon, ShieldWarningIcon, ToggleLeftIcon, ToggleRightIcon, UploadSimpleIcon, UserCheckIcon, UserIcon, UserMinusIcon, WarningIcon,
} from '@phosphor-icons/react'

export interface IconProps {
  size?: number | string
  strokeWidth?: number | string
  color?: string
  fill?: string
  stroke?: string  // lucide-совместимость, игнорируется
  className?: string
  style?: CSSProperties
  weight?: IconWeight
}

function wrap(Ph: PhIcon) {
  function Wrapped({ size = 24, strokeWidth, fill, weight, color, className, style }: IconProps) {
    const w: IconWeight = weight
      ?? (fill && fill !== 'none' ? 'fill'
        : Number(strokeWidth) >= 2.4 || Number(size) <= 14 ? 'bold'
        : 'regular')
    return <Ph size={size} weight={w} color={color ?? (fill && fill !== 'none' ? fill : 'currentColor')} className={className} style={style} />
  }
  return Wrapped
}

export const ArrowLeft = wrap(ArrowLeftIcon)
export const AlertCircle = wrap(WarningCircleIcon)
export const Award = wrap(MedalIcon)
export const BadgeCheck = wrap(SealCheckIcon)
export const BadgePercent = wrap(PercentIcon)
export const Bitcoin = wrap(CurrencyBtcIcon)
export const Calendar = wrap(CalendarBlankIcon)
export const Check = wrap(CheckIcon)
export const CheckCircle = wrap(CheckCircleIcon)
export const CheckCircle2 = wrap(CheckCircleIcon)
export const ChevronDown = wrap(CaretDownIcon)
export const ChevronLeft = wrap(CaretLeftIcon)
export const ChevronRight = wrap(CaretRightIcon)
export const Circle = wrap(CircleIcon)
export const Clock = wrap(ClockIcon)
export const Copy = wrap(CopyIcon)
export const CreditCard = wrap(CreditCardIcon)
export const Crown = wrap(CrownIcon)
export const FileText = wrap(FileTextIcon)
export const Gamepad2 = wrap(GameControllerIcon)
export const Gem = wrap(DiamondIcon)
export const Gift = wrap(GiftIcon)
export const Headphones = wrap(HeadsetIcon)
export const Heart = wrap(HeartIcon)
export const HelpCircle = wrap(QuestionIcon)
export const ImagePlus = wrap(ImageSquareIcon)
export const Info = wrap(InfoIcon)
export const Loader2 = wrap(CircleNotchIcon)
export const LogOut = wrap(SignOutIcon)
export const Menu = wrap(ListIcon)
export const MessageCircle = wrap(ChatCircleIcon)
export const MessageSquarePlus = wrap(ChatCenteredTextIcon)
export const Minus = wrap(MinusIcon)
export const Package = wrap(PackageIcon)
export const Paperclip = wrap(PaperclipIcon)
export const Plus = wrap(PlusIcon)
export const RefreshCw = wrap(ArrowsClockwiseIcon)
export const RotateCcw = wrap(ArrowCounterClockwiseIcon)
export const Search = wrap(MagnifyingGlassIcon)
export const Send = wrap(PaperPlaneRightIcon)
export const Settings = wrap(GearSixIcon)
export const Share2 = wrap(ShareNetworkIcon)
export const Shield = wrap(ShieldIcon)
export const ShieldCheck = wrap(ShieldCheckIcon)
export const ShoppingBag = wrap(ShoppingBagIcon)
export const ShoppingCart = wrap(ShoppingCartIcon)
export const Smartphone = wrap(DeviceMobileIcon)
export const Star = wrap(StarIcon)
export const Tag = wrap(TagIcon)
export const ThumbsDown = wrap(ThumbsDownIcon)
export const ThumbsUp = wrap(ThumbsUpIcon)
export const Trash2 = wrap(TrashIcon)
export const TrendingDown = wrap(TrendDownIcon)
export const TrendingUp = wrap(TrendUpIcon)
export const Users = wrap(UsersIcon)
export const Wallet = wrap(WalletIcon)
export const WifiOff = wrap(WifiSlashIcon)
export const X = wrap(XIcon)
export const XCircle = wrap(XCircleIcon)
export const Zap = wrap(LightningIcon)
export const ZoomIn = wrap(MagnifyingGlassPlusIcon)

// ── Админка ──
export const AlertTriangle = wrap(WarningIcon)
export const Bell = wrap(BellIcon)
export const DollarSign = wrap(CurrencyDollarIcon)
export const ExternalLink = wrap(ArrowSquareOutIcon)
export const Eye = wrap(EyeIcon)
export const EyeOff = wrap(EyeSlashIcon)
export const FolderOpen = wrap(FolderOpenIcon)
export const Image = wrap(ImageIcon)
export const ImageOff = wrap(ImageBrokenIcon)
export const MessageSquare = wrap(ChatCenteredIcon)
export const Mail = wrap(EnvelopeSimpleIcon)
export const Maximize2 = wrap(ArrowsOutSimpleIcon)
export const Minimize2 = wrap(ArrowsInSimpleIcon)
export const MinusCircle = wrap(MinusCircleIcon)
export const Pencil = wrap(PencilSimpleIcon)
export const PercentSquare = wrap(PercentIcon)
export const Pin = wrap(PushPinIcon)
export const PlusCircle = wrap(PlusCircleIcon)
export const Save = wrap(FloppyDiskIcon)
export const ShieldAlert = wrap(ShieldWarningIcon)
export const ShieldOff = wrap(ShieldSlashIcon)
export const ToggleLeft = wrap(ToggleLeftIcon)
export const ToggleRight = wrap(ToggleRightIcon)
export const Upload = wrap(UploadSimpleIcon)
export const UploadCloud = wrap(CloudArrowUpIcon)
export const User = wrap(UserIcon)
export const UserCheck = wrap(UserCheckIcon)
export const UserMinus = wrap(UserMinusIcon)
