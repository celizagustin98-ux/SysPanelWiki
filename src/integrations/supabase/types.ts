export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          created_at: string
          github_repo: string
          id: string
          singleton: boolean
          ultima_actualizacion: string | null
          ultima_revision: string | null
          updated_at: string
          version_actual: string
        }
        Insert: {
          created_at?: string
          github_repo?: string
          id?: string
          singleton?: boolean
          ultima_actualizacion?: string | null
          ultima_revision?: string | null
          updated_at?: string
          version_actual?: string
        }
        Update: {
          created_at?: string
          github_repo?: string
          id?: string
          singleton?: boolean
          ultima_actualizacion?: string | null
          ultima_revision?: string | null
          updated_at?: string
          version_actual?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          accion: string
          actor_email: string
          actor_id: string | null
          actor_nombre: string
          created_at: string
          detalle: Json
          entidad_desc: string
          entidad_id: string | null
          id: string
          modulo: string
        }
        Insert: {
          accion: string
          actor_email?: string
          actor_id?: string | null
          actor_nombre?: string
          created_at?: string
          detalle?: Json
          entidad_desc?: string
          entidad_id?: string | null
          id?: string
          modulo: string
        }
        Update: {
          accion?: string
          actor_email?: string
          actor_id?: string | null
          actor_nombre?: string
          created_at?: string
          detalle?: Json
          entidad_desc?: string
          entidad_id?: string | null
          id?: string
          modulo?: string
        }
        Relationships: []
      }
      credenciales: {
        Row: {
          categoria: string
          created_at: string
          created_by: string | null
          id: string
          ip: string | null
          notas: string | null
          secreto: string | null
          servicio: string
          updated_at: string
          url: string | null
          usuario: string | null
        }
        Insert: {
          categoria?: string
          created_at?: string
          created_by?: string | null
          id?: string
          ip?: string | null
          notas?: string | null
          secreto?: string | null
          servicio: string
          updated_at?: string
          url?: string | null
          usuario?: string | null
        }
        Update: {
          categoria?: string
          created_at?: string
          created_by?: string | null
          id?: string
          ip?: string | null
          notas?: string | null
          secreto?: string | null
          servicio?: string
          updated_at?: string
          url?: string | null
          usuario?: string | null
        }
        Relationships: []
      }
      guardias: {
        Row: {
          created_at: string
          desde: string
          hasta: string
          id: string
          notas: string | null
          operador_id: string | null
          operador_nombre: string
        }
        Insert: {
          created_at?: string
          desde: string
          hasta: string
          id?: string
          notas?: string | null
          operador_id?: string | null
          operador_nombre: string
        }
        Update: {
          created_at?: string
          desde?: string
          hasta?: string
          id?: string
          notas?: string | null
          operador_id?: string | null
          operador_nombre?: string
        }
        Relationships: []
      }
      inventario: {
        Row: {
          asignado_a: string | null
          categoria: string
          codigo: string
          created_at: string
          estado: string
          id: string
          marca: string | null
          modelo: string | null
          nombre: string
          notas: string | null
          numero_serie: string | null
          sector: string | null
          updated_at: string
        }
        Insert: {
          asignado_a?: string | null
          categoria?: string
          codigo: string
          created_at?: string
          estado?: string
          id?: string
          marca?: string | null
          modelo?: string | null
          nombre: string
          notas?: string | null
          numero_serie?: string | null
          sector?: string | null
          updated_at?: string
        }
        Update: {
          asignado_a?: string | null
          categoria?: string
          codigo?: string
          created_at?: string
          estado?: string
          id?: string
          marca?: string | null
          modelo?: string | null
          nombre?: string
          notas?: string | null
          numero_serie?: string | null
          sector?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          username?: string | null
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          created_at: string
          id: string
          modulo: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          modulo: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          modulo?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      tarea_comentarios: {
        Row: {
          autor_id: string
          contenido: string
          created_at: string
          id: string
          tarea_id: string
        }
        Insert: {
          autor_id: string
          contenido: string
          created_at?: string
          id?: string
          tarea_id: string
        }
        Update: {
          autor_id?: string
          contenido?: string
          created_at?: string
          id?: string
          tarea_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarea_comentarios_tarea_id_fkey"
            columns: ["tarea_id"]
            isOneToOne: false
            referencedRelation: "tareas"
            referencedColumns: ["id"]
          },
        ]
      }
      tarea_instructivos: {
        Row: {
          doc_id: string
          tarea_id: string
        }
        Insert: {
          doc_id: string
          tarea_id: string
        }
        Update: {
          doc_id?: string
          tarea_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarea_instructivos_doc_id_fkey"
            columns: ["doc_id"]
            isOneToOne: false
            referencedRelation: "wiki_docs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarea_instructivos_tarea_id_fkey"
            columns: ["tarea_id"]
            isOneToOne: false
            referencedRelation: "tareas"
            referencedColumns: ["id"]
          },
        ]
      }
      tarea_subtareas: {
        Row: {
          created_at: string
          hecha: boolean
          id: string
          tarea_id: string
          titulo: string
        }
        Insert: {
          created_at?: string
          hecha?: boolean
          id?: string
          tarea_id: string
          titulo: string
        }
        Update: {
          created_at?: string
          hecha?: boolean
          id?: string
          tarea_id?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarea_subtareas_tarea_id_fkey"
            columns: ["tarea_id"]
            isOneToOne: false
            referencedRelation: "tareas"
            referencedColumns: ["id"]
          },
        ]
      }
      tareas: {
        Row: {
          asignado_a: string | null
          created_at: string
          created_by: string | null
          descripcion: string | null
          estado: string
          estimacion_horas: number | null
          etiquetas: string[]
          id: string
          orden: number
          prioridad: string
          titulo: string
          updated_at: string
          vence_el: string | null
        }
        Insert: {
          asignado_a?: string | null
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          estado?: string
          estimacion_horas?: number | null
          etiquetas?: string[]
          id?: string
          orden?: number
          prioridad?: string
          titulo: string
          updated_at?: string
          vence_el?: string | null
        }
        Update: {
          asignado_a?: string | null
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          estado?: string
          estimacion_horas?: number | null
          etiquetas?: string[]
          id?: string
          orden?: number
          prioridad?: string
          titulo?: string
          updated_at?: string
          vence_el?: string | null
        }
        Relationships: []
      }
      toner_modelos: {
        Row: {
          correlativo: number
          created_at: string
          id: string
          marca: string | null
          nombre: string
          prefijo: string
          stock: number
          stock_minimo: number
        }
        Insert: {
          correlativo?: number
          created_at?: string
          id?: string
          marca?: string | null
          nombre: string
          prefijo: string
          stock?: number
          stock_minimo?: number
        }
        Update: {
          correlativo?: number
          created_at?: string
          id?: string
          marca?: string | null
          nombre?: string
          prefijo?: string
          stock?: number
          stock_minimo?: number
        }
        Relationships: []
      }
      toner_movimientos: {
        Row: {
          cantidad: number
          created_at: string
          id: string
          modelo_id: string
          notas: string | null
          responsable: string | null
          sector: string | null
          tipo: string
        }
        Insert: {
          cantidad?: number
          created_at?: string
          id?: string
          modelo_id: string
          notas?: string | null
          responsable?: string | null
          sector?: string | null
          tipo: string
        }
        Update: {
          cantidad?: number
          created_at?: string
          id?: string
          modelo_id?: string
          notas?: string | null
          responsable?: string | null
          sector?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "toner_movimientos_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "toner_modelos"
            referencedColumns: ["id"]
          },
        ]
      }
      toner_unidades: {
        Row: {
          codigo: string
          created_at: string
          estado: string
          id: string
          modelo_id: string
        }
        Insert: {
          codigo: string
          created_at?: string
          estado?: string
          id?: string
          modelo_id: string
        }
        Update: {
          codigo?: string
          created_at?: string
          estado?: string
          id?: string
          modelo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "toner_unidades_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "toner_modelos"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wiki_attachments: {
        Row: {
          created_at: string
          doc_id: string
          file_name: string
          file_path: string
          id: string
        }
        Insert: {
          created_at?: string
          doc_id: string
          file_name: string
          file_path: string
          id?: string
        }
        Update: {
          created_at?: string
          doc_id?: string
          file_name?: string
          file_path?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wiki_attachments_doc_id_fkey"
            columns: ["doc_id"]
            isOneToOne: false
            referencedRelation: "wiki_docs"
            referencedColumns: ["id"]
          },
        ]
      }
      wiki_docs: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          folder_id: string | null
          id: string
          tags: string[]
          title: string
          updated_at: string
          views: number
        }
        Insert: {
          content?: string
          created_at?: string
          created_by?: string | null
          folder_id?: string | null
          id?: string
          tags?: string[]
          title: string
          updated_at?: string
          views?: number
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          folder_id?: string | null
          id?: string
          tags?: string[]
          title?: string
          updated_at?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "wiki_docs_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "wiki_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      wiki_folders: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wiki_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "wiki_folders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      audit_actores: {
        Args: never
        Returns: {
          actor_email: string
          actor_id: string
          actor_nombre: string
        }[]
      }
      can_write: { Args: { _user_id: string }; Returns: boolean }
      directorio_usuarios: {
        Args: never
        Returns: {
          avatar_url: string
          full_name: string
          id: string
        }[]
      }
      generar_codigos_toner: {
        Args: { _cantidad: number; _modelo_id: string }
        Returns: string[]
      }
      has_perm: {
        Args: { _accion: string; _modulo: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_audit: {
        Args: {
          _accion: string
          _detalle: Json
          _entidad_desc: string
          _entidad_id: string
          _modulo: string
        }
        Returns: undefined
      }
      set_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "administrador" | "tecnico" | "consulta"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["administrador", "tecnico", "consulta"],
    },
  },
} as const
