# Fi_get_taxon_synonyms.R
#'
#' @title Gets all the synonyms of a name accepted in 'Flora iberica'
#'
#' @description Gets all the synonyms of a name accepted in 'Flora iberica', reading from http://www.floraiberica.es.
#'
#' @param genus A `character` with a generic taxon name.
#' @param epithet A `character` with an specific epithet name.
#' @param infra A `character` with an infraspecific name.
#' @param infrarank A `character` with the rank of the infraspecific name.
#'
#' @details This function reads from http://www.floraiberica.es and and retrieves all the synonyms of the given taxon, if present.
#'
#' @return A `list` with two components. The first component ('synonyms') is a `matrix` with the accepted name and, if found, its synonyms and some 'Flora iberica' fields, or is `NULL` if no names are found in Flora iberica' (e.g. genus not accepted in 'Flora iberica' (e.g. a synonym), is mistyped or out of 'Flora iberica' scope, or belongs to a not yet published genus). A second component ('message') gives further information to the user.
#'
#' @author Tiago Monteiro-Henriques. E-mail: \email{tmh.dev@@icloud.com}.
#'
#' @export
#'
Fi_get_taxon_synonyms <- function (genus, epithet=NULL, infra=NULL, infrarank=NULL) {
  if (is.null(genus)) {stop("Argument genus can not be NULL.")}
  if (!is.null(infra) & is.null(infrarank)) {stop("An infraspecific name was given, but not an infrasepcific rank.")}
  if (is.null(infra) & !is.null(infrarank)) {stop("An infraspecific rank was given, but not an infrasepcific name.")}

  #tests if the taxon is accepted in Fi
  aiFi <- Fi_taxon_in(genus, epithet, infra, infrarank)["accepted.in.Fi"]
  if (is.na(aiFi)) {return(list(synonyms=NA, message="Infrageneric taxon belonging to a not yet published genus."))}
  if (!as.logical(aiFi)) {return(list(synonyms=NULL, message="Taxon not accepted in Fi (synonym), or is mistyped, or is out of the Fi scope."))}
  #aiFi==TRUE corresponds to an accepted taxon. #Attention: Genus not published yet don't show synonyms in Fi and will return NULL.

  Fi_result_syn <- readLines(paste0("http://www.floraiberica.es/PHP/cientificos2.php?gen=", genus,"&espe=", epithet, "&infra=", infra), encoding="latin1", warn=FALSE) #For now "latin1" encoding seems appropriate. #Adding "&infrank=", infrarank" to the paste0() don't change the result of the search in Fi, so it was removed.
  i <- grep("td><br /><dt><b><i>", Fi_result_syn) #finds index of element with names (synonyms)
  if (length(i)==0) {return(list(synonyms=NULL, message="No synonyms found."))} #Attention: Genus not published yet never show synonyms in Fi and will return NULL.
  temp1 <- strsplit(Fi_result_syn[i], "<br>")
  temp2 <- lapply(temp1, gsub, pattern="<b><i> </b></i>", replacement="") #SUBSTITUIR "<b><i> </b></i>" por ""
  temp3 <- lapply(temp2, gsub, pattern="<i> </i>", replacement="") #SUBSTITUIR "<i> </i>" por ""
  temp4 <- lapply(temp3[[1]], aux_f_synon)
  temp4 <- temp4[!sapply(temp4, is.null)]
  res <- t(sapply(temp4, function (x) {t(x)}))
  colnames(res) <- c("name", "auth", "reference", "status")
  return(list(synonyms=res, message="Successful."))
}
