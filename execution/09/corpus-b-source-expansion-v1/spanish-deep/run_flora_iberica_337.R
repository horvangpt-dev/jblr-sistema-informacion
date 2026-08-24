#!/usr/bin/env Rscript
suppressPackageStartupMessages(library(jsonlite))
suppressPackageStartupMessages(library(florae))
args <- commandArgs(trailingOnly=TRUE)
stopifnot(length(args) == 2)
input <- args[[1]]
outdir <- args[[2]]
dir.create(outdir, recursive=TRUE, showWarnings=FALSE)
source_doc <- fromJSON(input, simplifyVector=FALSE)
rows <- Filter(function(x) !identical(x$TERMINAL_STATE, "RESOLVED_EXACT_ORIGINAL_NAME"), source_doc$rows)
if (length(rows) != 337) stop(sprintf("Expected 337 carry-forward rows, got %d", length(rows)))

norm_ws <- function(x) trimws(gsub("[[:space:]]+", " ", x))
parse_name <- function(x) {
  x0 <- norm_ws(gsub("×", "x", x, fixed=TRUE))
  toks <- strsplit(x0, " ", fixed=TRUE)[[1]]
  out <- list(original=x, normalized=x0, genus=if(length(toks)>=1) toks[[1]] else NA_character_, epithet=NA_character_, infra=NA_character_, rank=NA_character_, kind="UNPARSED")
  if (grepl("(^| )(sp\\.|spp\\.|gr\\.)( |$)", x0)) { out$kind <- "OPEN_IDENTIFICATION"; return(out) }
  if (length(toks)>=4 && any(toks == "x") && toks[[2]] != "x") { out$kind <- "HYBRID_FORMULA"; return(out) }
  if (length(toks)>=3 && toks[[2]] == "x") { out$epithet <- toks[[3]]; out$rank <- "nothospecies"; out$kind <- "NAMED_HYBRID"; return(out) }
  if (length(toks)>=4 && toks[[3]] %in% c("subsp.","ssp.","var.","f.")) {
    out$epithet <- toks[[2]]; out$infra <- toks[[4]]; out$rank <- switch(toks[[3]], "subsp."="subsp.", "ssp."="subsp.", "var."="var.", "f."="f."); out$kind <- "INFRASPECIFIC"; return(out)
  }
  if (length(toks)==2) { out$epithet <- toks[[2]]; out$rank <- "species"; out$kind <- "SPECIES"; return(out) }
  if (length(toks)>2) { out$epithet <- toks[[2]]; out$kind <- "AMBIGUOUS_EXTRA_TOKENS"; return(out) }
  out
}

obj_to_json_safe <- function(x) {
  tryCatch(toJSON(x, auto_unbox=TRUE, null="null", na="null", dataframe="rows", pretty=FALSE), error=function(e) toJSON(list(serialization_error=conditionMessage(e)), auto_unbox=TRUE))
}

extract_name_rows <- function(x) {
  out <- list()
  add_df <- function(d) {
    if (is.matrix(d)) d <- as.data.frame(d, stringsAsFactors=FALSE)
    if (!is.data.frame(d) || nrow(d)==0) return(NULL)
    nms <- tolower(names(d))
    name_col <- which(nms %in% c("name","taxon","taxon_name","names_and_auth"))[1]
    if (is.na(name_col)) name_col <- 1
    status_col <- which(nms %in% c("status","taxonomic_status"))[1]
    for (i in seq_len(nrow(d))) {
      nm <- as.character(d[[name_col]][i])
      st <- if (!is.na(status_col)) as.character(d[[status_col]][i]) else NA_character_
      if (!is.na(nm) && nzchar(trimws(nm))) out[[length(out)+1]] <<- list(name=norm_ws(nm), status=st)
    }
  }
  walk <- function(y) {
    if (is.data.frame(y) || is.matrix(y)) { add_df(y); return(NULL) }
    if (is.list(y)) for (z in y) walk(z)
  }
  walk(x)
  if (!length(out)) return(list())
  keys <- vapply(out, function(z) paste0(z$name,"||",z$status), character(1))
  out[!duplicated(keys)]
}

call_taxon <- function(p) {
  if (p$kind == "SPECIES") return(do.call(Fi_taxon_in, list(p$genus,p$epithet)))
  if (p$kind == "INFRASPECIFIC") return(do.call(Fi_taxon_in, list(p$genus,p$epithet,p$infra,p$rank)))
  if (p$kind == "NAMED_HYBRID" && exists("Fi_nothotaxon_in", where=asNamespace("florae"), inherits=FALSE)) return(do.call(get("Fi_nothotaxon_in", asNamespace("florae")), list(p$genus,p$epithet)))
  stop(paste("unsupported kind",p$kind))
}

call_synonyms <- function(parsed_accept) {
  fun <- get("Fi_get_taxon_synonyms", asNamespace("florae"))
  if (parsed_accept$kind == "SPECIES") return(do.call(fun, list(parsed_accept$genus, parsed_accept$epithet)))
  if (parsed_accept$kind == "INFRASPECIFIC") return(do.call(fun, list(parsed_accept$genus, parsed_accept$epithet, parsed_accept$infra, parsed_accept$rank)))
  NULL
}

results <- vector("list", length(rows))
for (i in seq_along(rows)) {
  r <- rows[[i]]; p <- parse_name(r$NOMBRE_RIOJA_VERBATIM)
  rec <- list(B_SOURCE_RECORD_ID=r$B_SOURCE_RECORD_ID, NOMBRE_RIOJA_VERBATIM=r$NOMBRE_RIOJA_VERBATIM, parsed=p, source="FLORA_IBERICA", query_state="NOT_RUN", raw=NULL, extracted_names=list(), synonym_expansions=list(), source_failure=NULL)
  if (p$kind %in% c("SPECIES","INFRASPECIFIC","NAMED_HYBRID")) {
    ans <- tryCatch(call_taxon(p), error=function(e) structure(list(error=conditionMessage(e)), class="fi_error"))
    if (inherits(ans,"fi_error")) {
      rec$query_state <- "SOURCE_FAILURE"; rec$source_failure <- ans$error
    } else {
      rec$query_state <- "QUERY_OK"; rec$raw <- obj_to_json_safe(ans); rec$extracted_names <- extract_name_rows(ans)
      accepted <- Filter(function(z) !is.null(z$status) && !is.na(z$status) && grepl("accepted|acept", z$status, ignore.case=TRUE), rec$extracted_names)
      if (!length(accepted) && length(rec$extracted_names)) accepted <- rec$extracted_names[1]
      if (length(accepted) > 3) accepted <- accepted[seq_len(3)]
      for (a in accepted) {
        pa <- parse_name(a$name)
        if (pa$kind %in% c("SPECIES","INFRASPECIFIC")) {
          sy <- tryCatch(call_synonyms(pa), error=function(e) structure(list(error=conditionMessage(e)), class="fi_error"))
          if (inherits(sy,"fi_error")) rec$synonym_expansions[[length(rec$synonym_expansions)+1]] <- list(accepted_name=a$name, state="SOURCE_FAILURE", detail=sy$error)
          else rec$synonym_expansions[[length(rec$synonym_expansions)+1]] <- list(accepted_name=a$name, state="QUERY_OK", raw=obj_to_json_safe(sy), extracted_names=extract_name_rows(sy))
        }
      }
    }
  } else rec$query_state <- paste0("SKIPPED_",p$kind)
  all_names <- c(r$NOMBRE_RIOJA_VERBATIM)
  if (length(rec$extracted_names)) all_names <- c(all_names, vapply(rec$extracted_names, `[[`, character(1), "name"))
  if (length(rec$synonym_expansions)) for (s in rec$synonym_expansions) if (!is.null(s$extracted_names) && length(s$extracted_names)) all_names <- c(all_names, vapply(s$extracted_names, `[[`, character(1), "name"))
  rec$name_network <- unique(norm_ws(all_names[nzchar(all_names)]))
  results[[i]] <- rec
  if (i %% 10 == 0) cat(sprintf("processed %d/337\n",i))
  Sys.sleep(0.15)
}
summary <- list(
  run_id="09_CORPUS_B_SPANISH_SYNONYMY_EIDOS_DEEP_20260824_001",
  source="FLORA_IBERICA",
  total=length(results),
  query_ok=sum(vapply(results,function(z) identical(z$query_state,"QUERY_OK"),logical(1))),
  source_failure=sum(vapply(results,function(z) identical(z$query_state,"SOURCE_FAILURE"),logical(1))),
  special_skipped=sum(vapply(results,function(z) grepl("^SKIPPED_",z$query_state),logical(1))),
  rows=results
)
writeLines(toJSON(summary, auto_unbox=TRUE, null="null", na="null", pretty=TRUE), file.path(outdir,"FLORA_IBERICA_337_TAXON_SWEEP.json"), useBytes=TRUE)
network <- lapply(results, function(z) list(B_SOURCE_RECORD_ID=z$B_SOURCE_RECORD_ID,NOMBRE_RIOJA_VERBATIM=z$NOMBRE_RIOJA_VERBATIM,source_rank=z$parsed$rank,source_kind=z$parsed$kind,query_state=z$query_state,names=z$name_network,source_failure=z$source_failure))
writeLines(toJSON(list(run_id=summary$run_id,source="FLORA_IBERICA",rows=network),auto_unbox=TRUE,null="null",na="null",pretty=TRUE), file.path(outdir,"FLORA_IBERICA_337_NAME_NETWORK.json"), useBytes=TRUE)
cat(toJSON(summary[c("run_id","source","total","query_ok","source_failure","special_skipped")],auto_unbox=TRUE),"\n")
